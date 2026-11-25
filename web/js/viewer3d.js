// Visor 3D de la placa (GLB exportado por KiCad) con three.js.
import * as THREE from "three";
import { GLTFLoader } from "../vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "../vendor/three/examples/jsm/controls/OrbitControls.js";

let current = null;

export function disposeViewer() {
  if (!current) return;
  cancelAnimationFrame(current.raf);
  current.ro.disconnect();
  current.renderer.dispose();
  current = null;
}

export function viewBoard(container, url, onStatus = () => {}) {
  disposeViewer();
  const W = () => container.clientWidth, H = () => container.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(W(), H());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.innerHTML = "";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, W() / H(), 0.0005, 50);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334433, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1, 2, 1.5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x99ccff, 0.8); rim.position.set(-1.5, 1, -1); scene.add(rim);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = true; controls.autoRotateSpeed = 0.8;
  renderer.domElement.addEventListener("pointerdown", () => (controls.autoRotate = false));

  onStatus("Cargando modelo 3D…");
  new GLTFLoader().load(url, gltf => {
    const root = gltf.scene;
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    root.position.sub(c);
    scene.add(root);
    const r = size.length() / 2;
    // distancia para que la placa quepa en el campo de visión (con margen)
    const d = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.8;
    camera.position.copy(new THREE.Vector3(0.35, 1.0, 0.85).normalize().multiplyScalar(d));
    camera.near = r / 100; camera.far = r * 50; camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0); controls.update();
    onStatus("");
  }, ev => {
    if (ev.total) onStatus(`Cargando modelo 3D… ${Math.round(ev.loaded / ev.total * 100)} %`);
  }, err => onStatus("No se pudo cargar el modelo 3D: " + err.message));

  const ro = new ResizeObserver(() => {
    renderer.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix();
  });
  ro.observe(container);
  const loop = () => { current.raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); };
  current = { renderer, ro, raf: 0, controls };
  loop();
  return {
    resetView: () => { controls.autoRotate = true; },
    topView: () => { const d = camera.position.length(); camera.position.set(0, d, 0.0001); controls.update(); controls.autoRotate = false; },
  };
}
