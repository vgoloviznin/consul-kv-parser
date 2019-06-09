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
    let Cache;

    before(() => {
        Parser = require("../lib");
        Cache = require("../lib/cache");
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

    describe('- getIn test', () => {
        let parser;
        let getCacheValueStub;
        let setCacheValueStub;

        beforeEach(() => {
            parser = new Parser();
            getCacheValueStub = sinon.stub(Cache, 'getValue');
            setCacheValueStub = sinon.stub(Cache, 'setValue');
        });

        afterEach(() => {
            getCacheValueStub.restore();
            setCacheValueStub.restore();
        });

        describe('- Throws errors correctly', () => {
            it('- correctly throw error if values are not initialized', () => {
                parser.values = undefined;

                try {
                    const values = parser.getIn('a', 'b');
                } catch (err) {
                    assert.equal(err.message, 'Values are not initialized');
                }
            });

            it('- correctly throw error if path is incorrect', () => {
                parser.values = {
                    a: { b: { c: 1 } }
                };

                try {
                    const values = parser.getIn('a', 'c', 'b');
                } catch (err) {
                    assert.equal(err.message, 'Incorrect path: a,c,b')
                }
            });

            it('- correctly throw error only if field is undefined', () => {
                parser.values = {
                    a: {
                        b: 0,
                        c: null,
                        d: undefined
                    }
                };

                sinon.spy(parser, 'getIn');

                assert.equal(parser.getIn('a', 'b'), 0);
                assert.equal(parser.getIn('a', 'c'), null);

                try {
                    parser.getIn('a', 'd');
                } catch (err) {
                    assert.equal(err.message, 'Incorrect path: a,d')
                }

                sinon.assert.threw(parser.getIn);
            });
        });

        describe('- Return correct values', () => {
            it('- return cached value if such exists', () => {
                parser.values = {
                    a: { b: { c: 1 } }
                };

                const cachedValue = 'some cached value';
                getCacheValueStub.returns(cachedValue);

                const value = parser.getIn('a', 'b', 'c');
                assert.equal(value, cachedValue);

                sinon.assert.calledWithExactly(getCacheValueStub, 'a,b,c');
                sinon.assert.notCalled(setCacheValueStub);
            });

            it('- correctly cache values', () => {
                parser.values = {
                    a: { b: { c: 1 } }
                };

                getCacheValueStub.returns(false);

                const value = parser.getIn('a', 'b', 'c');

                sinon.assert.calledWithExactly(setCacheValueStub, 'a,b,c', 1);
            });

            it('- correctly parse path and return value', () => {
                parser.values = {
                    a: { b: { c: 1 } }
                };

                getCacheValueStub.returns(false);
                setCacheValueStub.returns(true);

                const paths = [
                    {
                        p: ['a'],
                        expectedValue: { b: { c: 1 } }
                    },
                    {
                        p: ['a', 'b'],
                        expectedValue: { c: 1 }
                    },
                    {
                        p: ['a', 'b', 'c'],
                        expectedValue: 1
                    }
                ];

                paths.forEach(({ p, expectedValue }) => {
                    assert.deepEqual(parser.getIn(...p), expectedValue);
                });
            });
        });
    });
});