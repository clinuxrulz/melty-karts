
const stringTable: string[] = [];

let nextId = 0;
let freeIds: number[] = [];

function allocId() {
  return freeIds.pop() ?? nextId++;
}

function freeId(id: number) {
  if (id == nextId-1) {
    nextId--;
  } else {
    freeIds.push(id);
  }
}

export const EMPTY_STRING = "";

export function allocStringId(value: string): number {
  let id = allocId();
  stringTable[id] = value;
  return id;
}

export function freeStringId(id: number): void {
  stringTable[id] = EMPTY_STRING;
  freeId(id);
}

export function lookupString(id: number): string {
  let value = stringTable[id];
  if (value === undefined) {
    throw new Error("String use after free");
  }  
  return value;
}
