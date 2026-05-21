/**
 * Simple object diffing utility
 * Returns an object containing only the fields that changed
 */
export const getObjectDiff = (oldObj, newObj) => {
  const diff = {};
  
  // Find added or changed fields
  for (const key in newObj) {
    if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
      diff[key] = newObj[key];
    }
  }
  
  // Find removed fields (set to null)
  for (const key in oldObj) {
    if (!(key in newObj)) {
      diff[key] = null;
    }
  }
  
  return Object.keys(diff).length > 0 ? diff : null;
};

/**
 * Apply diff to an object
 */
export const applyDiff = (baseObj, diff) => {
  const result = { ...baseObj };
  for (const key in diff) {
    if (diff[key] === null) {
      delete result[key];
    } else {
      result[key] = diff[key];
    }
  }
  return result;
};
