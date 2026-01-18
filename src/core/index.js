/**
 * Index Builder - Build in-memory indexes for efficient lookups
 */

/**
 * @typedef {import('./types.js').ClassInstance} ClassInstance
 * @typedef {import('./types.js').RelationInstance} RelationInstance
 * @typedef {import('./types.js').LoadedData} LoadedData
 */

/**
 * @typedef {Object} OntologyIndex
 * @property {Map<string, ClassInstance[]>} byClass - Instances indexed by _class
 * @property {Map<string, ClassInstance | RelationInstance>} byId - Instances indexed by _id
 * @property {Map<string, RelationInstance[]>} byRelation - Relations indexed by _relation
 * @property {Map<string, (ClassInstance | RelationInstance)[]>} byField - Instances indexed by field values
 * @property {ClassInstance[]} allClasses - All class instances
 * @property {RelationInstance[]} allRelations - All relation instances
 */

/**
 * Build an in-memory index from loaded data
 * @param {LoadedData} data
 * @returns {OntologyIndex}
 */
export function buildIndex(data) {
  /** @type {OntologyIndex} */
  const index = {
    byClass: new Map(),
    byId: new Map(),
    byRelation: new Map(),
    byField: new Map(),
    allClasses: data.instances.classes,
    allRelations: data.instances.relations
  };

  // Index class instances
  for (const instance of data.instances.classes) {
    // By class type
    const className = instance._class;
    if (!index.byClass.has(className)) {
      index.byClass.set(className, []);
    }
    index.byClass.get(className).push(instance);

    // By ID
    if (instance._id) {
      index.byId.set(instance._id, instance);
    }

    // By field values
    indexFields(index, instance);
  }

  // Index relation instances
  for (const relation of data.instances.relations) {
    // By relation type
    const relationType = relation._relation;
    if (!index.byRelation.has(relationType)) {
      index.byRelation.set(relationType, []);
    }
    index.byRelation.get(relationType).push(relation);

    // By field values
    indexFields(index, relation);
  }

  return index;
}

/**
 * Index all fields of an instance
 * @param {OntologyIndex} index
 * @param {ClassInstance | RelationInstance} instance
 */
function indexFields(index, instance) {
  for (const [key, value] of Object.entries(instance)) {
    if (value === null || value === undefined) continue;
    
    const stringValue = String(value).toLowerCase();
    const fieldKey = `${key}:${stringValue}`;
    
    if (!index.byField.has(fieldKey)) {
      index.byField.set(fieldKey, []);
    }
    index.byField.get(fieldKey).push(instance);
  }
}

/**
 * Get all instances (classes and relations combined)
 * @param {OntologyIndex} index
 * @returns {(ClassInstance | RelationInstance)[]}
 */
export function getAllInstances(index) {
  return [...index.allClasses, ...index.allRelations];
}

/**
 * Get instances by class type
 * @param {OntologyIndex} index
 * @param {string} className
 * @returns {ClassInstance[]}
 */
export function getByClass(index, className) {
  return index.byClass.get(className) || [];
}

/**
 * Get instance by ID
 * @param {OntologyIndex} index
 * @param {string} id
 * @returns {ClassInstance | RelationInstance | undefined}
 */
export function getById(index, id) {
  return index.byId.get(id);
}

/**
 * Get relations by type
 * @param {OntologyIndex} index
 * @param {string} relationType
 * @returns {RelationInstance[]}
 */
export function getByRelation(index, relationType) {
  return index.byRelation.get(relationType) || [];
}
