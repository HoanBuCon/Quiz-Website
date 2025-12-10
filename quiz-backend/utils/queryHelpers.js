// Conversion Helper cho các routes phức tạp
// File này chứa các helper functions để convert Prisma patterns sang MySQL

const { query, queryOne, transaction } = require('./db');
const { generateCuid, formatDateForMySQL, parseJSON, stringifyJSON, buildWhereIn, intToBool, boolToInt } = require('./helpers');

/**
 * Load related records (giống Prisma include)
 * @param {string} table - Tên bảng
 * @param {Array} parentRecords - Mảng records cha
 * @param {string} foreignKey - Tên foreign key
 * @param {string} childField - Tên field sẽ attach vào parent
 */
async function includeMany(table, parentRecords, foreignKey, childField = 'children') {
  if (!parentRecords || parentRecords.length === 0) return parentRecords;
  
  const parentIds = parentRecords.map(r => r.id);
  const { clause, params } = buildWhereIn(parentIds);
  const children = await query(`SELECT * FROM ${table} WHERE ${foreignKey} ${clause}`, params);
  
  // Group children by parent ID
  const childrenByParent = {};
  for (const child of children) {
    const pid = child[foreignKey];
    if (!childrenByParent[pid]) childrenByParent[pid] = [];
    childrenByParent[pid].push(child);
  }
  
  // Attach to parents
  for (const parent of parentRecords) {
    parent[childField] = childrenByParent[parent.id] || [];
  }
  
  return parentRecords;
}

/**
 * Load single related record (giống Prisma include với relation 1-1)
 */
async function includeOne(table, parentRecords, foreignKey, childField = 'related', select = '*') {
  if (!parentRecords || parentRecords.length === 0) return parentRecords;
  
  const parentIds = parentRecords.map(r => r[foreignKey]);
  const { clause, params } = buildWhereIn(parentIds);
  const children = await query(`SELECT ${select} FROM ${table} WHERE id ${clause}`, params);
  
  // Map children by ID
  const childrenById = {};
  for (const child of children) {
    childrenById[child.id] = child;
  }
  
  // Attach to parents
  for (const parent of parentRecords) {
    parent[childField] = childrenById[parent[foreignKey]] || null;
  }
  
  return parentRecords;
}

/**
 * Count related records (giống Prisma _count)
 */
async function countRelated(table, parentRecords, foreignKey, countField = '_count') {
  if (!parentRecords || parentRecords.length === 0) return parentRecords;
  
  const parentIds = parentRecords.map(r => r.id);
  const { clause, params } = buildWhereIn(parentIds);
  const counts = await query(
    `SELECT ${foreignKey}, COUNT(*) as count FROM ${table} WHERE ${foreignKey} ${clause} GROUP BY ${foreignKey}`,
    params
  );
  
  // Map counts
  const countMap = {};
  for (const row of counts) {
    countMap[row[foreignKey]] = row.count;
  }
  
  // Attach to parents
  for (const parent of parentRecords) {
    parent[countField] = countMap[parent.id] || 0;
  }
  
  return parentRecords;
}

/**
 * Upsert pattern (INSERT ... ON DUPLICATE KEY UPDATE)
 */
async function upsert(table, uniqueFields, createData, updateData) {
  const createKeys = Object.keys(createData);
  const createValues = Object.values(createData);
  const updateKeys = Object.keys(updateData);
  
  const insertPlaceholders = createKeys.map(() => '?').join(', ');
  const updateClauses = updateKeys.map(k => `${k} = ?`).join(', ');
  
  const sql = `
    INSERT INTO ${table} (${createKeys.join(', ')})
    VALUES (${insertPlaceholders})
    ON DUPLICATE KEY UPDATE ${updateClauses}
  `;
  
  const params = [...createValues, ...Object.values(updateData)];
  await query(sql, params);
}

/**
 * Delete cascade simulation (nếu FK cascade không hoạt động)
 */
async function deleteCascade(table, id, cascadeRules = []) {
  await transaction(async (conn) => {
    // Delete children first (reverse order)
    for (const rule of cascadeRules.reverse()) {
      await conn.execute(
        `DELETE FROM ${rule.table} WHERE ${rule.foreignKey} = ?`,
        [id]
      );
    }
    // Delete parent
    await conn.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
  });
}

/**
 * Parse JSON fields trong result set
 */
function parseJSONFields(records, fields = []) {
  if (!records) return records;
  const isArray = Array.isArray(records);
  const arr = isArray ? records : [records];
  
  for (const record of arr) {
    for (const field of fields) {
      if (record[field] !== null && record[field] !== undefined) {
        record[field] = parseJSON(record[field]);
      }
    }
  }
  
  return isArray ? arr : arr[0];
}

/**
 * Convert boolean fields
 */
function convertBoolFields(records, fields = []) {
  if (!records) return records;
  const isArray = Array.isArray(records);
  const arr = isArray ? records : [records];
  
  for (const record of arr) {
    for (const field of fields) {
      if (record[field] !== null && record[field] !== undefined) {
        record[field] = intToBool(record[field]);
      }
    }
  }
  
  return isArray ? arr : arr[0];
}

module.exports = {
  includeMany,
  includeOne,
  countRelated,
  upsert,
  deleteCascade,
  parseJSONFields,
  convertBoolFields,
};
