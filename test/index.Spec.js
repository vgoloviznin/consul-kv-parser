"use strict";

const chai = require("chai");
const sinon = require("sinon");
const chaiAsPromised = require("chai-as-promised");
const sinonChai = require("sinon-chai");

chai.use(sinonChai);
chai.use(chaiAsPromised);
chai.should();
const assert = chai.assert;

describe("- Consul Parser test", () => {
    let Parser;

    before(() => {
        Parser = require("../lib");
    });

    describe("- Initialization test", () => {
        it("- Creates object with provided config", () => {
            let config  = {
                parser: {
                    prefix: "prefix"
                },
                consul: {
                    promisify: true
                }
            };

            let parser = new Parser(config);

            parser.config.should.be.deep.equal(config);
        });

        it("- Creates object with no config", () => {
            let config = {
                parser: {},
                consul: {
                    promisify: true
                }
            };

            let parser = new Parser();

            parser.config.should.be.deep.equal(config);
        });
    });

    describe("- Connect test", () => {
        //ToDo
    });

    describe("- Parse test", () => {
        let consulKVGetStub;
        beforeEach(() => {
            let consul = require("consul");
            consulKVGetStub = sinon.stub(consul().kv, "get");
        });
        afterEach(() => {
            consulKVGetStub.restore();
        });

        describe("- Throws correctly", () => {
            it("- Throws if no keys are provided", () => {
                let parser = new Parser();

                assert.throws(parser.parse, "Keys array is requred!");
            });

            it("- Throws if empty keys array is provided", () => {
                let parser = new Parser();
                let fn = () => {
                    parser.parse([]);
                };

                assert.throws(fn, "Keys array is requred!");
            });

            it("- Throws if misses key", () => {
                let parser = new Parser();
                let fn = () => {
                    parser.parse([{require: true}]);
                };

                assert.throws(fn);
            });

            it("- Throws if incorrect type", () => {
                let parser = new Parser();
                let fn = () => {
                    parser.parse([{key: "key", type: "some-type"}]);
                };

                assert.throws(fn);
            });
        });        

        describe("- Parses correctly", () => {
            let parser;

            beforeEach(() => {
                parser = new Parser();
                parser.client = {
                    kv: {
                        get: consulKVGetStub
                    }
                };
            });

            it("- Calls Consul for all passed keys", () => {
                const keys = [{key: "some-key"}, {key: "some-key2"}];
                consulKVGetStub.returns(Promise.resolve("val"));

                return parser.parse(keys).then(() => {
                    sinon.assert.callCount(consulKVGetStub, keys.length);
                });
            });

            it("- Uses prefix for keys", () => {
                const keys = [{key: "some-key"}];
                const prefix = "prefix";
                consulKVGetStub.returns(Promise.resolve("val"));
                parser.config.parser.prefix = prefix;

                return parser.parse(keys).then(() => {
                    parser.config.parser.prefix = null;
                    sinon.assert.calledWithExactly(consulKVGetStub, `${prefix}/${keys[0].key}`);
                });
            });

            it("- Throws if required property is missed", () => {
                const keys = [{key: "some-key", require: true}];
                consulKVGetStub.returns(Promise.resolve(undefined));

                let fn = () => {
                    return parser.parse(keys);
                };

                return parser.parse(keys).should.be.rejected;
            });

            it("- Parses unspecified type as string", () => {
                const keys = [{key: "some-key"}];
                const val = "123";
                consulKVGetStub.returns(Promise.resolve({Value: val}));

                return parser.parse(keys).should.become({
                    "some-key": val
                });
            });

            it("- Parses string correctly", () => {
                const keys = [{key: "some-key", type: Parser.types.string}];
                const str = "str";
                consulKVGetStub.returns(Promise.resolve({Value: str}));

                return parser.parse(keys).should.become({
                    "some-key": str
                });
            });

            it("- Parses integer correctly", () => {
                const keys = [{key: "some-key", type: Parser.types.number}];
                const num = 123;
                consulKVGetStub.returns(Promise.resolve({Value: num.toString()}));

                return parser.parse(keys).should.become({
                    "some-key": num
                });
            });

            it("- Parses float correctly", () => {
                const keys = [{key: "some-key", type: Parser.types.number}];
                const num = 123.456;
                consulKVGetStub.returns(Promise.resolve({Value: num.toString()}));

                return parser.parse(keys).should.become({
                    "some-key": num
                });
            });

            it("- Parses object correctly", () => {
                const keys = [{key: "some-key", type: Parser.types.object}];
                const obj = {prop: 1, str: "Str", arr: [1, 2, 3], o: {prop: "Some inner prop"}};
                consulKVGetStub.returns(Promise.resolve({Value: JSON.stringify(obj)}));

                return parser.parse(keys).should.become({
                    "some-key": obj
                });
            });

            it("- Parses complex key into deep object", () => {
                const keys = [{key: "some/key/complex"}];
                const str = "val";
                consulKVGetStub.returns(Promise.resolve({Value: str}));

                return parser.parse(keys).should.become({
                    some: {
                        key: {
                            complex: str
                        }
                    }
                });
            });

            it("- Parses several keys into correct deep object", () => {
                const keys = [{key: "some/key/complex", require: true}, {key: "some/key/numb", type: Parser.types.number, require: true}, {key: "other/obj", type: Parser.types.object, require: true}];
                const str = "val";
                const numb = 123.32;
                const obj = {some: "Other"};
                consulKVGetStub.withArgs(keys[0].key).returns(Promise.resolve({Value: str}));
                consulKVGetStub.withArgs(keys[1].key).returns(Promise.resolve({Value: numb}));
                consulKVGetStub.withArgs(keys[2].key).returns(Promise.resolve({Value: JSON.stringify(obj)}));
                consulKVGetStub.throws("No args!");

                return parser.parse(keys).should.become({
                    some: {
                        key: {
                            complex: str,
                            numb
                        }
                    },
                    other: {
                        obj
                    }
                });
            });
        });        
    });
});