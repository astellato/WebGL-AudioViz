/*
    scenes/index.js - the visualizer lineup, in order.

    Each definition is lightweight data (id, name, variants) plus a lazy
    `create` factory, so the lineup is known before any heavy scene object
    exists. Phase 2 appends the vizz.fm-style scenes and Butterchurn here.

    Copyright © 2021 Anthony Stellato
*/

import { blobSceneDefinition } from './BlobScene.js';
import { meshGridSceneDefinition } from './MeshGridScene.js';

const SCENE_DEFINITIONS = [
    blobSceneDefinition,
    meshGridSceneDefinition,
];

export { SCENE_DEFINITIONS };
