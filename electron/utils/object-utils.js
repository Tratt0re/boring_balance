/** True for `{}` literals, `JSON.parse` results and prototype-less objects; false for Date, Map, class instances, arrays. */
function isPlainObject(value) {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

module.exports = {
  isPlainObject,
};
