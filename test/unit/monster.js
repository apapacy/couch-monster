'use strict';

var monster = require('monster');


describe('#define()', function () {
    var Monster;

    beforeEach(function () {
        Monster = monster.define('Monster');
    });

    it('should return a new constructor function', function () {
        Monster.should.be.a('function');
    });

    describe('constructor', function () {
        it('should return a function with name matching argument', function () {
            Monster.name.should.equal('Monster');
        });

        it('should set id to given id', function () {
            var marvin = new Monster('marvin');
            marvin.attributes._id.should.equal('marvin');
        });

        it('should initialize attributes to constructor argument', function () {
            var marvin = new Monster('marvin', {
                location: 'couch',
                scary: true,
            });
            marvin.attributes.should.deep.equal({
                _id: 'marvin',
                location: 'couch',
                scary: true,
            });
        });

        it('should initialize attributes to empty object otherwise',
           function () {
               var marvin = new Monster();
               expect(marvin.attributes).to.exist;
               marvin.attributes.should.deep.equal({});
           });

        it('should make attributes readonly', function () {
            var marvin = new Monster();
            var assignment = function () {
                marvin.attributes = {};
            };
            assignment.should.throw(TypeError, /read only/);
        });

        it('should make "_type" attribute readonly', function () {
            var factory = function () {
                return new Monster({
                    _type: 'Not Monster',
                });
            };
            factory.should.throw(TypeError, /read only/);
        });

        it('should call initialize on object', function () {
            var options = {
                initialize: sinon.spy(),
            };
            var Monster = monster.define('Monster', options);
            var marvin = new Monster('marvin');
            options.initialize.should.have.been.calledOn(marvin);
        });

        it('should set attributes to default values', function () {
            var options = {
                defaults: {
                    location: 'couch',
                    scary: false,
                }
            };
            var Monster = monster.define('Monster', options);
            var marvin = new Monster();
            marvin.attributes.should.deep.equal({
                location: 'couch',
                scary: false,
            });
        });

        it('should not overwrite given attributes with defaults', function () {
            var options = {
                defaults: {
                    location: 'couch',
                    scary: false,
                }
            };
            var Monster = monster.define('Monster', options);
            var marvin = new Monster({
                scary: true,
                teeth: 'sharp',
            });
            marvin.attributes.should.deep.equal({
                location: 'couch',
                scary: true,
                teeth: 'sharp',
            });
        });
    });
});

describe('Model', function () {
    var Monster, marvin;

    before(function () {
        Monster = monster.define('Monster');
    });

    beforeEach(function () {
        marvin = new Monster('marvin', {
            scary: true,
            teeth: 'sharp',
        });
    });

    describe('#get()', function () {
        it('should return attribute if present', function () {
            expect(marvin.get('scary')).to.exist;
            marvin.get('scary').should.equal(true);
        });

        it('should return undefined unless present', function () {
            expect(marvin.get('fake field')).not.to.exist;
        });
    });

    describe('#has()', function () {
        it('should be true if attribute exists', function () {
            marvin.attributes.friendly = undefined;
            marvin.has('friendly').should.be.true;
        });

        it('should be false if attribute does not exist', function () {
            marvin.has('friendly').should.be.false;
        });
    });

    describe('#unset()', function () {
        it('should clear attribute and return true', function () {
            marvin.unset('teeth').should.be.true;
            marvin.attributes.should.not.have.property('teeth');
        });

        it('should be false on nonexistent attribute', function () {
            marvin.unset('fake attribute').should.be.false;
        });
    });
});
