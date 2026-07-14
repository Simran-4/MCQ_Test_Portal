const crypto = require("crypto");
const { getPool } = require("../db/postgres");

const modelRegistry = {};
const isObject = value => value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof RegExp);
const clone = value => JSON.parse(JSON.stringify(value));

function valueAt(object, path) {
  return path.split(".").reduce((value, key) => value == null ? undefined : value[key], object);
}

function same(left, right) {
  if (left instanceof Date) left = left.toISOString();
  if (right instanceof Date) right = right.toISOString();
  if (right === null) return left === null || left === undefined;
  return String(left) === String(right);
}

function matchesValue(actual, expected) {
  if (Array.isArray(actual) && !(expected && typeof expected === "object" && !Array.isArray(expected))) {
    return actual.some(item => matchesValue(item, expected));
  }
  if (expected instanceof RegExp) return expected.test(String(actual || ""));
  if (!isObject(expected)) return same(actual, expected);
  return Object.entries(expected).every(([operator, value]) => {
    if (operator === "$in") {
      return Array.isArray(actual)
        ? actual.some(item => value.some(expectedItem => same(item, expectedItem)))
        : value.some(item => same(actual, item));
    }
    if (operator === "$ne") return !same(actual, value);
    if (operator === "$gte") return new Date(actual).getTime() >= new Date(value).getTime();
    if (operator === "$lte") return new Date(actual).getTime() <= new Date(value).getTime();
    return matchesValue(actual?.[operator], value);
  });
}

function matches(document, query = {}) {
  return Object.entries(query).every(([key, expected]) => {
    if (key === "$or") return expected.some(item => matches(document, item));
    if (key === "$and") return expected.every(item => matches(document, item));
    return matchesValue(valueAt(document, key), expected);
  });
}

function project(document, fields) {
  if (!fields) return document;
  const requested = String(fields).trim().split(/\s+/).filter(Boolean);
  const excluded = requested.filter(key => key.startsWith("-")).map(key => key.slice(1));
  if (excluded.length) {
    const output = clone(document);
    excluded.forEach(key => delete output[key]);
    return output;
  }
  const output = { _id: document._id };
  requested.forEach(key => { if (key in document) output[key] = document[key]; });
  return output;
}

class Query {
  constructor(model, query, one = false) { this.model = model; this.query = query || {}; this.one = one; this.fields = null; this.order = null; this.populates = []; }
  select(fields) { this.fields = fields; return this; }
  sort(order) { this.order = order; return this; }
  populate(path, fields) { this.populates.push({ path, fields }); return this; }
  async exec() {
    const result = await this.model._find(this.query);
    let docs = result.filter(doc => matches(doc, this.query));
    if (this.order) {
      const entries = Object.entries(this.order);
      docs.sort((a, b) => entries.reduce((out, [key, direction]) => out || (valueAt(a, key) > valueAt(b, key) ? direction : valueAt(a, key) < valueAt(b, key) ? -direction : 0), 0));
    }
    docs = docs.map(doc => new this.model(project(doc, this.fields), true));
    for (const populate of this.populates) await Promise.all(docs.map(doc => this.model._populate(doc, populate)));
    return this.one ? docs[0] || null : docs;
  }
  then(resolve, reject) { return this.exec().then(resolve, reject); }
}

function createModel(collection, defaults = {}, references = {}) {
  class Model {
    constructor(values = {}, hydrated = false) {
      Object.assign(this, hydrated ? {} : clone(defaults), clone(values));
      if (!this._id) this._id = crypto.randomUUID();
    }
    toJSON() { const output = {}; Object.keys(this).forEach(key => output[key] = this[key]); return output; }
    toObject() { return this.toJSON(); }
    async save() {
      const now = new Date().toISOString();
      if (!this.createdAt) this.createdAt = now;
      this.updatedAt = now;
      const data = this.toJSON(); delete data._id;
      await getPool().query(`INSERT INTO app_documents (collection, id, data, created_at, updated_at)
        VALUES ($1, $2, $3::jsonb, $4, $4) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`, [collection, this._id, JSON.stringify(data), this.createdAt]);
      return this;
    }
    static async _find() {
      const { rows } = await getPool().query("SELECT id, data, created_at, updated_at FROM app_documents WHERE collection = $1", [collection]);
      return rows.map(row => ({ _id: row.id, ...row.data, createdAt: row.data.createdAt || row.created_at, updatedAt: row.data.updatedAt || row.updated_at }));
    }
    static find(query = {}) { return new Query(Model, query); }
    static findOne(query = {}) { return new Query(Model, query, true); }
    static findById(id) { return Model.findOne({ _id: id }); }
    static async countDocuments(query = {}) { return (await Model.find(query)).length; }
    static async distinct(field, query = {}) { return [...new Set((await Model.find(query)).map(item => valueAt(item, field)))]; }
    static async create(values) { return new Model(values).save(); }
    static async insertMany(values = []) {
      if (!Array.isArray(values)) throw new TypeError("insertMany expects an array of documents");
      return Promise.all(values.map(valuesForDocument => new Model(valuesForDocument).save()));
    }
    static async deleteMany(query = {}) { const docs = await Model.find(query); if (docs.length) await getPool().query("DELETE FROM app_documents WHERE id = ANY($1::uuid[])", [docs.map(doc => doc._id)]); return { deletedCount: docs.length }; }
    static async findByIdAndDelete(id) { const document = await Model.findById(id); if (document) await getPool().query("DELETE FROM app_documents WHERE id = $1", [id]); return document; }
    static async findByIdAndUpdate(id, update, options = {}) { return Model.findOneAndUpdate({ _id: id }, update, options); }
    static async findOneAndUpdate(query, update, options = {}) {
      let document = await Model.findOne(query);
      if (!document && !options.upsert) return null;
      const isNew = !document;
      if (!document) document = new Model({});
      Object.assign(document, clone(update.$set || update));
      if (isNew && update.$setOnInsert) Object.assign(document, clone(update.$setOnInsert));
      await document.save();
      return options.new === false ? null : document;
    }
    static async _populate(document, { path, fields }) {
      const modelName = references[path]; const Related = modelRegistry[modelName]; if (!Related) return;
      const parts = path.split(".");
      if (parts.length === 1) { const id = document[path]; if (id) document[path] = await Related.findById(id).select(fields); return; }
      if (path === "answers.questionId" && Array.isArray(document.answers)) {
        const ids = [...new Set(document.answers.map(answer => answer.questionId).filter(Boolean).map(String))];
        if (!ids.length) return;
        const relatedDocs = await Related.find({ _id: { $in: ids } }).select(fields);
        const byId = new Map(relatedDocs.map(doc => [String(doc._id), doc]));
        document.answers.forEach(answer => {
          if (answer.questionId && byId.has(String(answer.questionId))) {
            answer.questionId = byId.get(String(answer.questionId));
          }
        });
      }
    }
  }
  modelRegistry[collection] = Model;
  return Model;
}

module.exports = { createModel };
