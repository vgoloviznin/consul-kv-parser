"use strict";

const consul = require("consul");
const Joi = require("joi");
const Cache = require('./cache');

const TYPES = {
    string: "string",
    number: "number",
    object: "object"
};

const DEFAULT_PARSER_CONFIG = {};

const KeySchema = Joi.array().items(Joi.object().keys({
    key: Joi.string().required(),
    type: Joi.string().valid([TYPES.string, TYPES.number, TYPES.object]),
    require: Joi.boolean()
}));

const ConfigSchema = Joi.object().keys({
    parser: Joi.object().keys({
        prefix: Joi.string()
    }),
    consul: Joi.object()
});

class Parser {
    constructor(config) {   
        config = config || {};

        Joi.assert(config, ConfigSchema, "Config does not have right format!");
        
        if (!config.parser) {
            config.parser = DEFAULT_PARSER_CONFIG;
        }

        if (!config.consul){
            config.consul = {
                promisify: true
            };
        }

        if (!config.consul.promisify) {
            config.consul.promisify = true;
        }

        this.config = config;
    }

    static get types() {
        return TYPES;
    }

    connect() {
        //consul is modifying the config object that is passed to it
        let consulConfig = JSON.parse(JSON.stringify(this.config.consul || {}));
        this.client = consul(consulConfig);
    }

    parse(keys) {
        if (!keys || keys.length === 0) {
            throw new Error("Keys array is requred!");
        }

        Joi.assert(keys, KeySchema, "Some keys have incorrect format!");

        let values = {};
        
        let keyPromises = keys.map((key) => {
            let consulKey = key.key;

            if (this.config.parser.prefix && this.config.parser.prefix !== "") {
                consulKey = `${this.config.parser.prefix}/` + consulKey;
            }
            
            return this.client.kv.get(consulKey).then((v) => {
                if (key.require && !v) {
                    throw new Error(`Key ${consulKey} is required but not found`);
                }

                //initialize value object with object structure
                let props = key.key.split("/");
                let root = values;
                for (let i = 0; i < props.length - 1; i++) {
                    if (!root[props[i]]) {
                        root[props[i]] = {};
                    }

                    root = root[props[i]];
                }

                if (v) {
                    if (!key.type || key.type === TYPES.string) {
                        root[props[props.length - 1]] = v.Value;
                    } else {
                        switch (key.type) {
                            case TYPES.object:
                                root[props[props.length - 1]] = JSON.parse(v.Value);
                                break;
                            case TYPES.number:
                                root[props[props.length - 1]] = +v.Value;
                                break;
                            default:
                                throw new Error(`Type ${key.type} for ${consulKey} is not supported`);
                        }
                    }
                }
            });
        });

        return Promise.all(keyPromises).then(() => {
            this.values = values;
            return values;
        });
    }

    getIn(...path) {
        if (!this.values) {
            throw new Error('Values are not initialized');
        }

        const pathAsString = path.toString();
        const cachedValue = Cache.getValue(pathAsString);
        if (cachedValue) {
            return cachedValue;
        }

        const pathValue = path.reduce((acc, p) => {
            const value = acc[p];
            if (typeof value === 'undefined') {
                throw new Error(`Incorrect path: ${pathAsString}`);
            }
            return value;
        }, this.values);

        Cache.setValue(pathAsString, pathValue);
        return pathValue;
    }
}

module.exports = Parser;