#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const SUPPORTED_SCHEMA_KEYS = new Set(['schemaVersion', 'type', 'required', 'properties', 'enum', 'items']);

function main() {
  const [schemaPath, dataPath] = process.argv.slice(2);
  if (!schemaPath || !dataPath) {
    throw new Error('Usage: node scripts/upgrade/validate-json.mjs <schema.json> <data.json>');
  }

  const schema = readJson(schemaPath);
  const data = readJson(dataPath);
  assertSupportedSchema(schema, schemaPath);
  const errors = [];
  validate(schema, data, '$', errors);

  if (errors.length > 0) {
    throw new Error(`Schema validation failed for ${dataPath}\n${errors.join('\n')}`);
  }

  console.log(`validated ${dataPath} against ${schemaPath}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertSupportedSchema(value, filePath, pointer = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSupportedSchema(item, filePath, `${pointer}[${index}]`));
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  for (const key of Object.keys(value)) {
    if (isSchemaObject(value) && !SUPPORTED_SCHEMA_KEYS.has(key)) {
      throw new Error(`Unsupported schema keyword ${key} at ${filePath}:${pointer}`);
    }
    assertSupportedSchema(value[key], filePath, `${pointer}.${key}`);
  }
}

function isSchemaObject(value) {
  return Boolean(value && typeof value === 'object' && (
    typeof value.type === 'string'
    || Array.isArray(value.required)
    || (value.properties && typeof value.properties === 'object' && !Array.isArray(value.properties))
    || Array.isArray(value.enum)
    || (value.items && typeof value.items === 'object' && !Array.isArray(value.items))
  ));
}

function validate(schema, data, pointer, errors) {
  if (schema.type) {
    const actual = typeOf(data);
    if (actual !== schema.type) {
      errors.push(`${pointer}: expected ${schema.type}, got ${actual}`);
      return;
    }
  }

  if (schema.enum && !schema.enum.includes(data)) {
    errors.push(`${pointer}: expected one of ${schema.enum.join(', ')}, got ${JSON.stringify(data)}`);
  }

  if (schema.required && data && typeof data === 'object' && !Array.isArray(data)) {
    for (const key of schema.required) {
      if (!(key in data)) {
        errors.push(`${pointer}: missing required property ${key}`);
      }
    }
  }

  if (schema.properties && data && typeof data === 'object' && !Array.isArray(data)) {
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      if (key in data) {
        validate(childSchema, data[key], `${pointer}.${key}`, errors);
      }
    }
  }

  if (schema.items && Array.isArray(data)) {
    data.forEach((item, index) => validate(schema.items, item, `${pointer}[${index}]`, errors));
  }
}

function typeOf(value) {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (Number.isInteger(value)) {
    return 'integer';
  }
  if (value === null) {
    return 'null';
  }
  return typeof value;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
