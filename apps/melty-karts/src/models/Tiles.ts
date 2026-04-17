import * as THREE from "three";

export enum TileType {
  Grass = 0,
  Road = 1,
  Tree = 2,
  House = 3,
}

export const TILE_SIZE = 2;

export const ROAD_TYPE = TileType.Road;
export const TREE_TYPE = TileType.Tree;
export const HOUSE_TYPE = TileType.House;

function createGrassBase(size: number): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(size, 0.1, size);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3c8f4d, roughness: 1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.05;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

function createRoadBase(size: number): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(size, 0.1, size);
  const mat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.05;
  mesh.receiveShadow = true;
  group.add(mesh);

  const lineGeo = new THREE.PlaneGeometry(size * 0.06, size * 0.5);
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const positions = [[-size * 0.25, 0.11, 0], [size * 0.25, 0.11, 0]];
  for (const pos of positions) {
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.position.set(pos[0], pos[1], pos[2]);
    line.rotation.x = -Math.PI / 2;
    group.add(line);
  }
  return group;
}

function createTreeBase(size: number): THREE.Group {
  const group = new THREE.Group();
  const trunkH = size * 0.6;
  const trunkR = size * 0.1;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(trunkR * 0.7, trunkR, trunkH, 8),
    new THREE.MeshStandardMaterial({ color: 0x8b4513 })
  );
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  group.add(trunk);

  const foliageR = size * 0.35;
  const foliageH = size * 0.5;
  const foliage = new THREE.Mesh(
    new THREE.ConeGeometry(foliageR, foliageH, 8),
    new THREE.MeshStandardMaterial({ color: 0x228b22 })
  );
  foliage.position.y = trunkH + foliageH / 2 - 0.05;
  foliage.castShadow = true;
  group.add(foliage);
  return group;
}

function createHouseBase(size: number): THREE.Group {
  const group = new THREE.Group();
  const w = size * 0.5;
  const d = size * 0.5;
  const h = size * 0.5;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: 0xf5f5dc })
  );
  body.position.y = h / 2;
  body.castShadow = true;
  group.add(body);

  const roofH = size * 0.35;
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(w, d) * 0.6, roofH, 4),
    new THREE.MeshStandardMaterial({ color: 0x8b0000 })
  );
  roof.position.y = h + roofH / 2;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);
  return group;
}

const DUAL_OFFSET = TILE_SIZE / 2;

function countCorners(
  grid: number[][],
  row: number,
  col: number,
  rows: number,
  cols: number,
  terrain: number
): number {
  let corners = 0;
  if (row > 0 && col > 0 && (grid[row - 1]?.[col - 1] & terrain) !== 0) corners |= 8;
  if (row > 0 && col < cols - 1 && (grid[row - 1]?.[col + 1] & terrain) !== 0) corners |= 4;
  if (row < rows - 1 && col > 0 && (grid[row + 1]?.[col - 1] & terrain) !== 0) corners |= 2;
  if (row < rows - 1 && col < cols - 1 && (grid[row + 1]?.[col + 1] & terrain) !== 0) corners |= 1;
  return corners;
}

const DUAL_TILE_COUNT = 16;

export function createGrassTile(size: number, cornerMask: number = 0): THREE.Group {
  return createGrassBase(size);
}

export function createRoadTile(size: number, cornerMask: number = 0): THREE.Group {
  const group = createRoadBase(size);
  const corners = cornerMask;
  
  if (corners === 0 || corners === 15) return group;

  const edgeGeo = new THREE.PlaneGeometry(size * 0.4, size * 0.4);
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x2d6b3a });

  if ((corners & 12) === 0 && (corners & 3) === 0) {
    const mesh = new THREE.Mesh(edgeGeo, edgeMat);
    mesh.position.set(0, 0.11, 0);
    mesh.rotation.x = -Math.PI / 2;
    group.add(mesh);
  }

  return group;
}

export function createTreeTile(size: number, cornerMask: number = 0): THREE.Group {
  if (cornerMask === 0) return createTreeBase(size);

  const group = createGrassBase(size);
  const tree = createTreeBase(size);
  tree.position.set(0, 0, 0);
  group.add(tree);
  return group;
}

export function createHouseTile(size: number, cornerMask: number = 0): THREE.Group {
  if (cornerMask === 0) return createHouseBase(size);

  const group = createGrassBase(size);
  const house = createHouseBase(size);
  house.position.set(0, 0, 0);
  group.add(house);
  return group;
}

export function getCornerMask(
  grid: number[][],
  row: number,
  col: number,
  rows: number,
  cols: number,
  terrain: number
): number {
  return countCorners(grid, row, col, rows, cols, terrain);
}

interface DualTileResult {
  tile: THREE.Group;
  offsetX: number;
  offsetZ: number;
  rotationY: number;
}

export function createDualGridTile(
  grid: number[][],
  row: number,
  col: number,
  rows: number,
  cols: number,
  terrain: number,
  size: number
): DualTileResult {
  const cornerMask = countCorners(grid, row, col, rows, cols, terrain);
  const worldX = col * size;
  const worldZ = row * size;

  if (terrain === ROAD_TYPE) {
    return {
      tile: createRoadTile(size, cornerMask),
      offsetX: 0,
      offsetZ: 0,
      rotationY: 0,
    };
  }

  if (terrain === TREE_TYPE) {
    return {
      tile: createTreeTile(size, cornerMask),
      offsetX: 0,
      offsetZ: 0,
      rotationY: 0,
    };
  }

  if (terrain === HOUSE_TYPE) {
    return {
      tile: createHouseTile(size, cornerMask),
      offsetX: 0,
      offsetZ: 0,
      rotationY: 0,
    };
  }

  return {
    tile: createGrassTile(size, cornerMask),
    offsetX: 0,
    offsetZ: 0,
    rotationY: 0,
  };
}

export function generateLevel(
  grid: number[][],
  rows: number,
  cols: number,
  roadTerrain: number,
  treeTerrain: number,
  houseTerrain: number
): void {
  for (let y = 0; y < rows; y++) {
    grid[y] = [];
    for (let x = 0; x < cols; x++) {
      grid[y][x] = 0;
    }
  }

  const centerX = cols / 2;
  const centerY = rows / 2;

  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
      if (dist < 3) {
        grid[y][x] = roadTerrain;
        continue;
      }

      const rand = Math.random();
      if (rand < 0.05) {
        let nearRoad = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < rows && nx >= 0 && nx < cols) {
              if ((grid[ny][nx] & roadTerrain) !== 0) {
                nearRoad = true;
                break;
              }
            }
          }
          if (nearRoad) break;
        }
        if (nearRoad) grid[y][x] = treeTerrain;
      } else if (rand < 0.08 && x > 2 && x < cols - 3 && y > 2 && y < rows - 3) {
        let nearRoad = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < rows && nx >= 0 && nx < cols) {
              if ((grid[ny][nx] & roadTerrain) !== 0) {
                nearRoad = true;
                break;
              }
            }
          }
          if (nearRoad) break;
        }
        if (nearRoad) grid[y][x] = houseTerrain;
      }
    }
  }

  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (const [dx, dy] of dirs) {
    let cx = Math.floor(centerX);
    let cy = Math.floor(centerY);
    for (let i = 0; i < 5; i++) {
      cx += dx;
      cy += dy;
      if (cx > 0 && cx < cols - 1 && cy > 0 && cy < rows - 1) {
        if ((grid[cy][cx] & treeTerrain) === 0 && (grid[cy][cx] & houseTerrain) === 0) {
          grid[cy][cx] = roadTerrain;
        }
      }
    }
  }
}