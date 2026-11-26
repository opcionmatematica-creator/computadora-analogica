//! Aplicación de escritorio de la computadora analógica (solo la biblioteca estándar de Rust).
//!
//!   computadora-analogica            -> sirve el proyecto en http://127.0.0.1:8642/web/ y abre la ventana
//!   computadora-analogica --no-open  -> solo el servidor
//!
//! La web es estática; el servidor añade /api/* para abrir en KiCad los proyectos, los esquemáticos
//! completos y las simulaciones. Funciona en Windows y Linux. Se cierra solo cuando ya no queda
//! ninguna ventana de la app (si se abrió en el navegador predeterminado, sigue en marcha).
#![cfg_attr(windows, windows_subsystem = "windows")]

use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const NO_WINDOW: u32 = 0x0800_0000;

const HOST: &str = "127.0.0.1";
const PROFILE: &str = "ComputadoraAnalogica";

/// Carpeta del proyecto: la primera, subiendo desde el ejecutable o el directorio actual, que tiene web/index.html.
fn find_root() -> PathBuf {
    let mut starts = vec![];
    if let Ok(exe) = std::env::current_exe() {
        starts.push(exe);
    }
    if let Ok(cwd) = std::env::current_dir() {
        starts.push(cwd);
    }
    for s in starts {
        let mut p: Option<&Path> = Some(s.as_path());
        while let Some(d) = p {
            if d.join("web").join("index.html").exists() {
                return d.to_path_buf();
            }
            p = d.parent();
        }
    }
    std::env::current_dir().unwrap_or_default()
}

fn which(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path).map(|d| d.join(name)).find(|f| f.exists())
}

fn kicad() -> PathBuf {
    if cfg!(windows) {
        let base = std::env::var("LOCALAPPDATA").unwrap_or_default();
        Path::new(&base).join("Programs").join("KiCad").join("10.0").join("bin").join("kicad.exe")
    } else {
        which("kicad").unwrap_or_else(|| PathBuf::from("/usr/bin/kicad"))
    }
}

fn spawn_detached(exe: &Path, args: &[&str]) -> bool {
    let mut c = Command::new(exe);
    c.args(args).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    c.creation_flags(NO_WINDOW);
    c.spawn().is_ok()
}

fn mime(p: &Path) -> &'static str {
    match p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "glb" => "model/gltf-binary",
        "pdf" => "application/pdf",
        "csv" => "text/csv; charset=utf-8",
        "zip" => "application/zip",
        "cir" | "lib" | "txt" | "kicad_sch" | "kicad_pro" => "text/plain; charset=utf-8",
        "webmanifest" => "application/manifest+json",
        "ico" => "image/x-icon",
        _ => "application/octet-stream",
    }
}

fn pct_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(if b[i] == b'+' { b' ' } else { b[i] });
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn pct_encode(s: &str) -> String {
    s.bytes()
        .map(|c| match c {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (c as char).to_string(),
            _ => format!("%{:02X}", c),
        })
        .collect()
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

struct Resp {
    code: u16,
    ctype: String,
    body: Vec<u8>,
    location: Option<String>,
}

impl Resp {
    fn json(code: u16, body: &str) -> Resp {
        Resp { code, ctype: "application/json".into(), body: body.as_bytes().to_vec(), location: None }
    }
    fn redirect(to: &str) -> Resp {
        Resp { code: 302, ctype: "text/plain".into(), body: vec![], location: Some(to.into()) }
    }
}

/// Carpeta KiCad de un id: módulo (hardware/<id>), completo (hardware/<id>/completo) o simulación.
fn project_dir(root: &Path, q: &HashMap<String, String>) -> Option<(PathBuf, String)> {
    let ok = |s: &str| !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
    if let Some(m) = q.get("mod").filter(|m| ok(m)) {
        let d = root.join("hardware").join(m);
        if q.get("completo").is_some() {
            return Some((d.join("completo"), format!("{m}_completo")));
        }
        return d.exists().then(|| (d, m.clone()));
    }
    if let Some(id) = q.get("sim").filter(|m| ok(m)) {
        let kdir = root.join("simulaciones").join("kicad");
        for e in fs::read_dir(&kdir).ok()?.flatten() {
            let med = fs::read_to_string(e.path().join("medidas.json")).unwrap_or_default();
            if med.contains(&format!("\"id\": \"{id}\"")) || med.contains(&format!("\"modulo\": \"{id}\"")) {
                let pro = fs::read_dir(e.path()).ok()?.flatten().map(|f| f.path())
                    .find(|f| f.extension().map_or(false, |x| x == "kicad_pro"))?;
                let stem = pro.file_stem()?.to_string_lossy().into_owned();
                return Some((e.path(), stem));
            }
        }
    }
    None
}

fn api(root: &Path, method: &str, path: &str, q: &HashMap<String, String>) -> Resp {
    match path {
        "/api/info" => return Resp::json(200, &format!("{{\"desktop\":true,\"kicad\":{}}}", kicad().exists())),
        "/api/ping" => return Resp::json(200, "{\"ok\":true}"),
        _ => {}
    }
    if method != "POST" {
        return Resp::json(405, "{\"error\":\"POST\"}");
    }
    let Some((dir, stem)) = project_dir(root, q).filter(|(d, _)| d.exists()) else {
        return Resp::json(404, "{\"error\":\"proyecto desconocido\"}");
    };
    match path {
        "/api/kicad" => {
            let k = kicad();
            if !k.exists() {
                return Resp::json(500, &format!("{{\"error\":\"KiCad no encontrado en {}\"}}", esc(&k.display().to_string()).replace('\\', "/")));
            }
            let pro = dir.join(format!("{stem}.kicad_pro"));
            let target = if pro.exists() { pro } else { dir.join(format!("{stem}.kicad_sch")) };
            spawn_detached(&k, &[&target.to_string_lossy()]);
            Resp::json(200, "{\"ok\":true}")
        }
        "/api/folder" => {
            let opener = if cfg!(windows) { "explorer.exe" } else if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
            spawn_detached(Path::new(opener), &[&dir.to_string_lossy()]);
            Resp::json(200, "{\"ok\":true}")
        }
        _ => Resp::json(404, "{\"error\":\"?\"}"),
    }
}

fn listing(url_path: &str, dir: &Path) -> Resp {
    let mut items: Vec<_> = fs::read_dir(dir).map(|r| r.flatten().collect()).unwrap_or_else(|_| vec![]);
    items.sort_by_key(|e| e.file_name());
    let mut li = String::new();
    for e in items {
        let name = e.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || name == "__pycache__" {
            continue;
        }
        let is_dir = e.path().is_dir();
        let img = if name.to_ascii_lowercase().ends_with(".png") { format!("<img src=\"{}\">", pct_encode(&name)) } else { String::new() };
        li += &format!("<li><a href=\"{}{}\">{}{}</a>{}</li>", pct_encode(&name), if is_dir { "/" } else { "" },
                       if is_dir { "📁 " } else { "📄 " }, esc(&name), img);
    }
    let t = esc(&pct_decode(url_path));
    let html = format!("<!doctype html><meta charset=\"utf-8\"><title>{t}</title>\
        <style>body{{font:15px system-ui;background:#0e1512;color:#dbe9e1;padding:24px}}a{{color:#39d98a;text-decoration:none}}li{{margin:4px 0}}img{{max-width:720px;display:block;margin:6px 0 18px;border-radius:8px}}</style>\
        <h2>{t}</h2><p><a href=\"../\">⬑ subir</a></p><ul>{li}</ul>");
    Resp { code: 200, ctype: "text/html; charset=utf-8".into(), body: html.into_bytes(), location: None }
}

fn serve_path(root: &Path, url_path: &str) -> Resp {
    if url_path == "/" {
        return Resp::redirect("/web/");
    }
    let rel = pct_decode(url_path);
    if rel.split(['/', '\\']).any(|c| c == "..") {
        return Resp::json(403, "{}");
    }
    let mut p = root.join(rel.trim_start_matches('/'));
    if p.is_dir() {
        if !p.join("index.html").exists() {
            if !url_path.ends_with('/') {
                return Resp::redirect(&format!("{url_path}/"));
            }
            return listing(url_path, &p);
        }
        p = p.join("index.html");
    }
    match fs::read(&p) {
        Ok(body) => Resp { code: 200, ctype: mime(&p).into(), body, location: None },
        Err(_) => Resp { code: 404, ctype: "text/plain".into(), body: b"404".to_vec(), location: None },
    }
}

fn handle(root: Arc<PathBuf>, mut s: TcpStream) {
    let _ = s.set_read_timeout(Some(Duration::from_secs(10)));
    let mut r = BufReader::new(match s.try_clone() { Ok(c) => c, Err(_) => return });
    let mut line = String::new();
    if r.read_line(&mut line).is_err() {
        return;
    }
    let mut parts = line.split_whitespace();
    let (method, target) = (parts.next().unwrap_or("").to_string(), parts.next().unwrap_or("/").to_string());
    let mut clen = 0usize;
    loop {
        let mut h = String::new();
        if r.read_line(&mut h).is_err() || h.trim().is_empty() {
            break;
        }
        if let Some(v) = h.to_ascii_lowercase().strip_prefix("content-length:") {
            clen = v.trim().parse().unwrap_or(0);
        }
    }
    if clen > 0 {
        let mut sink = vec![0u8; clen.min(1 << 20)];
        let _ = r.read_exact(&mut sink);
    }
    let (path, query) = target.split_once('?').unwrap_or((&target, ""));
    let q: HashMap<String, String> = query.split('&').filter(|x| !x.is_empty())
        .map(|kv| { let (k, v) = kv.split_once('=').unwrap_or((kv, "")); (pct_decode(k), pct_decode(v)) })
        .collect();
    let resp = if path.starts_with("/api/") { api(&root, &method, path, &q) } else { serve_path(&root, path) };
    let reason = match resp.code { 200 => "OK", 302 => "Found", 403 => "Forbidden", 404 => "Not Found", 405 => "Method Not Allowed", _ => "Error" };
    let mut head = format!("HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: no-cache\r\nConnection: close\r\n",
                           resp.code, reason, resp.ctype, resp.body.len());
    if let Some(l) = &resp.location {
        head += &format!("Location: {l}\r\n");
    }
    head += "\r\n";
    let _ = s.write_all(head.as_bytes());
    if method != "HEAD" {
        let _ = s.write_all(&resp.body);
    }
}

/// Abre una ventana propia (Edge/Chrome/Chromium con --app). Devuelve false si tuvo que usar el navegador predeterminado.
fn open_window(port: u16) -> bool {
    let app = format!("http://{HOST}:{port}/web/");
    let cands: Vec<PathBuf> = if cfg!(windows) {
        let pf86 = std::env::var("ProgramFiles(x86)").unwrap_or_default();
        let pf = std::env::var("ProgramFiles").unwrap_or_default();
        vec![Path::new(&pf86).join("Microsoft/Edge/Application/msedge.exe"),
             Path::new(&pf).join("Microsoft/Edge/Application/msedge.exe"),
             Path::new(&pf).join("Google/Chrome/Application/chrome.exe")]
    } else {
        ["microsoft-edge", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].iter().filter_map(|n| which(n)).collect()
    };
    let base = if cfg!(windows) {
        PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default())
    } else {
        std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".config"))
    };
    let profile = base.join(PROFILE).join("perfil");
    if let Some(exe) = cands.into_iter().find(|p| p.exists()) {
        return spawn_detached(&exe, &[&format!("--app={app}"), &format!("--user-data-dir={}", profile.display()),
                                     "--start-maximized", "--no-first-run"]);
    }
    if cfg!(windows) {
        spawn_detached(Path::new("cmd"), &["/c", "start", "", &app]);
    } else {
        spawn_detached(Path::new(if cfg!(target_os = "macos") { "open" } else { "xdg-open" }), &[&app]);
    }
    false
}

/// Número de ventanas de la app (navegador lanzado con el perfil propio), o None si no se pudo contar.
fn count_windows() -> Option<usize> {
    let out = if cfg!(windows) {
        let mut c = Command::new("powershell");
        c.args(["-NoProfile", "-Command",
                &format!("(Get-CimInstance Win32_Process -Filter \"Name='msedge.exe' or Name='chrome.exe'\" | Where-Object {{ $_.CommandLine -like '*{PROFILE}*' }}).Count")]);
        #[cfg(windows)]
        c.creation_flags(NO_WINDOW);
        c.output().ok()?
    } else {
        Command::new("pgrep").args(["-fc", &format!("user-data-dir=.*{PROFILE}")]).output().ok()?
    };
    // pgrep sale con código 1 cuando no encuentra nada: eso es «0 ventanas», no un error.
    Some(String::from_utf8_lossy(&out.stdout).trim().parse().unwrap_or(0))
}

fn main() {
    let no_open = std::env::args().any(|a| a == "--no-open");
    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8642);
    let root = Arc::new(find_root());
    let listener = match TcpListener::bind((HOST, port)) {
        Ok(l) => l,
        Err(_) => {
            // ya está en marcha: abre otra ventana y termina
            if !no_open {
                open_window(port);
            }
            return;
        }
    };
    println!("Computadora analógica: http://{HOST}:{port}/web/  (raíz: {})", root.display());
    if !no_open && open_window(port) {
        thread::spawn(|| {
            let mut empty = 0;
            loop {
                thread::sleep(Duration::from_secs(60));
                match count_windows() {
                    Some(0) => empty += 1,
                    Some(_) => empty = 0,
                    None => {}
                }
                if empty >= 3 {
                    std::process::exit(0); // ~3 min sin ventanas
                }
            }
        });
    }
    for s in listener.incoming().flatten() {
        let root = Arc::clone(&root);
        thread::spawn(move || handle(root, s));
    }
}
