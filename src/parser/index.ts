import { maybeDecompress } from './decompress';
import { isLitematic, parseLitematic } from './litematic';
import { isMcedit, parseMcedit } from './mcedit';
import { NbtError, readNbt } from './nbt';
import { parseSponge, spongeRoot } from './sponge';
import { isStructure, parseStructure } from './structure';
import { SchematicError, type SchematicData } from './types';

export const SUPPORTED_EXTENSIONS = ['.litematic', '.schem', '.nbt', '.schematic'];

/**
 * Parses any supported schematic file. The format is detected from the
 * content, not the extension, so renamed files still open.
 */
export async function parseSchematic(bytes: Uint8Array, fileName = ''): Promise<SchematicData> {
  if (bytes.length === 0) throw new SchematicError('The file is empty.');
  let raw: Uint8Array;
  try {
    raw = await maybeDecompress(bytes);
  } catch {
    throw new SchematicError('The file could not be decompressed. It may be corrupted or not a schematic file.');
  }
  let root;
  try {
    root = readNbt(raw).value;
  } catch (e) {
    const detail = e instanceof NbtError ? ` (${e.message})` : '';
    throw new SchematicError(`The file is not valid NBT data and could not be read${detail}. It may be corrupted or not a schematic file.`);
  }

  let data: SchematicData;
  try {
    if (isLitematic(root)) data = parseLitematic(root);
    else if (spongeRoot(root)) data = parseSponge(spongeRoot(root)!);
    else if (isStructure(root)) data = parseStructure(root);
    else if (isMcedit(root)) data = parseMcedit(root);
    else throw new SchematicError('Unrecognized schematic format. Supported formats: .litematic, .schem (Sponge), .nbt (structure block) and .schematic (MCEdit/WorldEdit 1.12).');
  } catch (e) {
    if (e instanceof SchematicError) throw e;
    if (e instanceof RangeError) throw new SchematicError(e.message);
    throw new SchematicError(`The schematic could not be read: ${(e as Error).message}`);
  }

  if (!data.meta.name) data.meta.name = fileName.replace(/\.[^.]+$/, '') || 'Untitled';
  return data;
}

export * from './types';
