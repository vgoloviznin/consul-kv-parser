module.exports = {
  cache: {},
  
  setValue(key, value) {
    this.cache[key] = value;
  },

  getValue(key) {
    return this.cache[key]
  }
}