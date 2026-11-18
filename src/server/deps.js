// Dependency Resolver Helper
// Resolves express & cors cleanly across workspace packages
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const searchPaths = [
  'D:/Upcraft/workspace/upcraft-agency-os/node_modules',
  'D:/Upcraft/workspace/upcraft-admin-panel/node_modules'
];

function resolveModule(name) {
  try {
    return require(name);
  } catch {
    const resolvedPath = require.resolve(name, { paths: searchPaths });
    return require(resolvedPath);
  }
}

export const express = resolveModule('express');
export const cors = resolveModule('cors');

