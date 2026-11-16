export function resolveModel(models, requested) {
  let model = models.find(m => m.id === requested);
  if (!model && ['pocket','atlas'].includes(requested)) {
    const family = models.filter(m => m.id.startsWith(requested + '-'));
    if (family.length === 1) model = family[0];
  }
  if (!model) throw new Error('Unknown model. Use --list-models to list available policies.');
  if (!/^[a-z][a-z0-9-]*\.bin$/.test(model.file)) throw new Error('Invalid model artifact path.');
  return model;
}
