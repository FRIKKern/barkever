export const oldEditor = () => {
  const define = customElements.define.bind(customElements)
  customElements.define = (name, ctor, options) => {
    if (name === 'bp-paper-editor') Object.defineProperty(ctor, 'CONTRACT_VERSION', {value: '1.16.0'})
    define(name, ctor, options)
  }
}
