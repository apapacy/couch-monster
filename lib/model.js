'use strict';

var monster = require('./monster');
var Collection = require('./collection');
var Query = require('./query');

var _ = require('underscore');
var errs = require('errs');


module.exports = function (name, options) {
    if (name in monster.models) {
        throw errs.create({
            message: 'Model "' + name + '" is already defined.',
        });
    }

    options = options || {};

    var constructor = function (id, attributes) {
        if (_.isObject(id)) {
            attributes = id;
            id = undefined;
        }

        attributes = _.defaults(attributes || {}, options.defaults);

        if (id) {
            attributes._id = id;
        }

        Object.defineProperty(this, 'attributes', {
            value: {},
            writeable: false,
            enumerable: true,
        });
        Object.defineProperty(this.attributes, 'type', {
            enumerable: false,
            writeable: false,
        });

        if (attributes.type !== undefined) {
            // Throws error here because of 'use strict'
            this.attributes.type = attributes.type;
        }
        this.set(attributes);

        if (options.initialize) {
            options.initialize.call(this);
        }
    };

    // Create named constructor function
    var Model = new Function("constructor",
                             "return function " + name + "(){ " +
                             "    constructor.apply(this, arguments);" +
                             "}"
                            )(constructor);

    Model.prototype.clone = function () {
        return new this.constructor(this.attributes);
    };

    Model.prototype.toJSON = function () {
        return _.clone(this.attributes);
    };

    Model.prototype.get = function (attr) {
        return this.attributes[attr];
    };

    Model.prototype.set = function (attr, value) {
        if (arguments.length == 1) {
            var newAttributes = attr;
            _.extend(this.attributes, newAttributes);
        }
        else {
            this.attributes[attr] = value;
        }
    };

    Model.prototype.has = function (attr) {
        return (attr in this.attributes);
    };

    Model.prototype.unset = function (attr) {
        if (this.has(attr)) {
            delete this.attributes[attr];
            return true;
        }
        return false;
    };

    Model.prototype.clear = function () {
        var self = this;
        _.each(this.attributes, function (value, key) {
            delete self.attributes[key];
        });
    };

    Model.prototype.id = function () {
        return this.get('_id');
    };

    Model.prototype.rev = function () {
        return this.get('_rev');
    };

    Model.prototype.isNew = function () {
        return !this.get('_id') || !this.get('_rev');
    };

    Model.prototype.validate = function () {
        if (!options.schema) {
            return undefined;
        }

        var report = monster.validator.validate(
            this.attributes, options.schema);
        return report.errors.length ? report.errors : undefined;
    };

    Model.prototype.isValid = function () {
        return !this.validate();
    };

    Model.prototype.exists = function (callback) {
        if (!this.id()) return errs.handle({
            message: 'Model cannot exist without id',
        }, callback);
        monster.db.head(this.id(), function (err, undefined_body, headers) {
            if (err && err.status_code === 404) {
                callback();
            }
            else if (err) {
                errs.handle(err, callback);
            }
            else {
                var revision = headers.etag.replace(/"/g, '');
                callback(null, revision);
            }
        });
    };

    Model.prototype.fetch = function (callback) {
        var self = this;
        if (!this.id()) return errs.handle({
            message: 'Cannot fetch model without id',
        }, callback);
        monster.db.get(this.id(), function (err, res) {
            if (err) return errs.handle(err, callback);
            self.clear();
            self.set(res);
            callback();
        });
    };

    Model.prototype.save = function (callback) {
        var errors = this.validate();
        if (errors) {
            return errs.handle({
                name: 'ValidationError',
                errors: errors,
            }, callback);
        }

        var self = this;
        var attributes = this.toJSON();
        attributes.type = this.constructor.name;
        monster.db.insert(attributes, this.id(), function (err, res) {
            if (err && self.isNew() && err.status_code === 409) {
                return errs.handle({
                    name: 'UniquenessError',
                    message: 'ID "' + self.id() + '" already exists',
                }, callback);
            }
            else if (err) {
                return errs.handle(err, callback);
            }
            else if (!res.ok) {
                return errs.handle({
                    name: 'DatabaseError',
                    response: res,
                }, callback);
            }
            else {
                self.set({
                    _id: res.id,
                    _rev: res.rev,
                });
                callback();
            }
        });
    };

    Model.prototype.destroy = function (callback) {
        var self = this;
        monster.db.destroy(this.id(), this.rev(), function (err, res) {
            if (err) return errs.handle(err, callback);
            else if (!res.ok) {
                return errs.handle({
                    name: 'DatabaseError',
                    response: res,
                }, callback);
            }
            else {
                self.set({
                    _id: res.id,
                    _rev: res.rev,
                    _deleted: true,
                });
                callback();
            }
        });
    };

    Model.getModel = function (key) {
        var queryOptions = {
            key: key,
            include_docs: true,
            limit: 2,
        };
        var query = new Query(Model.name, queryOptions, function (callback) {
            return function (err, results) {
                if (err) return errs.handle(err, callback);
                else if (results.total_rows === 0) {
                    callback();
                }
                else if (results.total_rows === 1) {
                    var document = results.rows[0].doc;
                    var constructor = monster.models[document.type];
                    if (!constructor) {
                        return errs.handle({
                            name: 'ViewError',
                            message: 'Unknown document type "' + document.type + '"',
                            document: document,
                        }, callback);
                    }
                    delete document.type;
                    callback(null, new constructor(document));
                }
                else {
                    return errs.handle({
                        name: 'ViewError',
                        message: 'Multiple documents found',
                        query: queryOptions,
                        results: results,
                    }, callback);
                }
            };
        });
        _.each(options.views || {}, function (unused, key) {
            query.addView(key);
        });
        return query;
    };

    Model.getCollection = function (key) {
        var queryOptions = {
            include_docs: true,
        };
        var query = new Query(Model.name, queryOptions, function (callback) {
            return function (err, results) {
                if (err) return errs.handle(err, callback);
                try {
                    var models = _.map(results.rows, function (res) {
                        var document = res.doc;
                        var constructor = monster.models[document.type];
                        if (!constructor) {
                            throw errs.create({
                                name: 'ViewError',
                                message: 'Unknown document type "' + document.type + '"',
                                document: document,
                            });
                        }
                        delete document.type;
                        return new constructor(document);
                    });
                }
                catch (err) {
                    return errs.handle(err, callback);
                }

                callback(null, new Collection(models));
            };
        });
        _.each(options.views || {}, function (unused, key) {
            query.addView(key);
        });
        return query;
    };

    return monster.models[Model.name] = Model;
};
