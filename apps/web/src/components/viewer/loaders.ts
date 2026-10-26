import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Achata uma cena (OBJ/GLB) em uma única geometria com as transformações aplicadas. */
function flatten(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    let g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (k !== "position") g.deleteAttribute(k);
    parts.push(g);
  });
  if (!parts.length) throw new Error("Arquivo sem malhas");
  return parts.length === 1 ? parts[0] : mergeGeometries(parts)!;
}

export async function loadGeometry(url: string, format: string, onProgress: (p: number) => void) {
  const progress = (e: ProgressEvent) => e.lengthComputable && onProgress(e.loaded / e.total);
  let g: THREE.BufferGeometry;
  switch (format) {
    case "stl":
      g = await new STLLoader().loadAsync(url, progress);
      break;
    case "ply":
      g = await new PLYLoader().loadAsync(url, progress);
      break;
    case "obj":
      g = flatten(await new OBJLoader().loadAsync(url, progress));
      break;
    case "glb":
      g = flatten((await new GLTFLoader().loadAsync(url, progress)).scene);
      break;
    default:
      throw new Error(`Formato não suportado: ${format}`);
  }
  // segmentações médicas saem em coordenadas do paciente (Z = crânio-caudal); three.js é Y-up
  if (format !== "glb") g.rotateX(-Math.PI / 2);
  // STL traz normais por face (aspecto facetado): soldar vértices e recalcular deixa a superfície lisa
  for (const k of Object.keys(g.attributes)) if (k !== "position") g.deleteAttribute(k);
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  onProgress(1);
  return g;
}
