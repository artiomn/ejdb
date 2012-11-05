var ejdblib;
try {
    ejdblib = require("../build/Release/ejdb_native.node");
} catch (e) {
    console.error("Warning: Using the DEBUG version of EJDB nodejs binding");
    ejdblib = require("../build/Debug/ejdb_native.node");
}
var EJDBImpl = ejdblib.NodeEJDB;

const DEFAULT_OPEN_MODE = (ejdblib.JBOWRITER | ejdblib.JBOCREAT);
var EJDB = function(dbFile, openMode) {
    this._impl = new EJDBImpl(dbFile, (openMode > 0) ? openMode : DEFAULT_OPEN_MODE);
    return this;
};

for (var k in ejdblib) { //Export constants
    if (k.indexOf("JB") === 0) {
        EJDB[k] = ejdblib[k];
    }
}
EJDB.DEFAULT_OPEN_MODE = DEFAULT_OPEN_MODE;

/**
 * Open database.
 * Returns database instance handle object .
 *
 * Default open mode: JBOWRITER | JBOCREAT
 *
 * This is blocking function.
 *
 * @param {String} dbFile Database main file name
 * @param {Number} [openMode=JBOWRITER | JBOCREAT] Bitmast of open modes:
 *      - `JBOREADER` Open as a reader.
 *      - `JBOWRITER` Open as a writer.
 *      - `JBOCREAT` Create db if it not exists
 *      - `JBOTRUNC` Truncate db.
 * @returns {EJDB} EJDB database wrapper
 */

EJDB.open = function(dbFile, openMode) {
    return new EJDB(dbFile, openMode);
};

/**
 * Close database.
 * If database was not opened it does nothing.
 *
 * This is blocking function.
 */
EJDB.prototype.close = function() {
    return this._impl.close();
};

/**
 * Check if database in opened state.
 */
EJDB.prototype.isOpen = function() {
    return this._impl.isOpen();
};

/**
 * Automatically creates new collection if it does't exists.
 * Optional collection options `copts`
 * are applied only for newly created collection.
 * For existing collections `copts` takes no effect.
 *
 * This is blocking function.
 *
 * @param {String} cname Name of collection.
 * @param {Object} [copts] Collection options.
 * @return {*}
 */
EJDB.prototype.ensureCollection = function(cname, copts) {
    return this._impl.ensureCollection(cname, copts || {});
};

/**
 *  Removes collection.
 *
 *  Call variations:
 *      - rmCollection(cname)
 *      - rmCollection(cname, cb)
 *      - rmCollection(cname, prune, cb)
 *
 * @param {String} cname Name of collection.
 * @param {Boolean} [prune=false] If true the collection data will erased from disk.
 * @param {Function} [cb] Callback function with arguments: (error)
 */
EJDB.prototype.removeCollection = function(cname, prune, cb) {
    if (arguments.length == 2) {
        cb = prune;
        prune = false;
    }
    if (!cb) {
        cb = function() {
        };
    }
    return this._impl.removeCollection(cname, !!prune, cb);
};


/**
 * Save/update specified JSON objects in the collection.
 * If collection with `cname` does not exists it will be created.
 *
 * Each persistent object has unique identifier (OID) placed in the `_id` property.
 * If a saved object does not have this `_id` it will be autogenerated.
 * To identify and update object it should contains `_id` property.
 *
 * Call variations:
 *      - save(cname, json object, [cb])
 *      - save(cname, <Array of json objects>, [cb])
 *
 * @param {String} cname Name of collection.
 * @param {Array|Object} jsarr Signle JSON object or array of JSON objects to save
 * @param {Function} [cb] Callback function with arguments: (error, {Array} of OIDs for saved objects)
 */
EJDB.prototype.save = function(cname, jsarr, cb) {
    if (!jsarr) {
        return;
    }
    if (jsarr.constructor !== Array) {
        jsarr = [jsarr];
    }
    return this._impl.save(cname, jsarr, function(err, oids) {
        if (err) {
            if (cb) {
                cb(err);
            }
            return;
        }
        //Assign _id property for newly created objects
        for (var i = jsarr.length - 1; i >= 0; --i) {
            var so = jsarr[i];
            if (so != null && so["_id"] !== oids[i]) {
                so["_id"] = oids[i];
            }
        }
        if (cb) {
            cb(err, oids);
        }
    });
};


/**
 * Loads JSON object identified OID from the collection.
 *
 * @param {String} cname Name of collection
 * @param {String} oid Object identifier (OID)
 * @param {Function} cb  Callback function with arguments: (error, obj)
 *        `obj`:  Retrieved JSON object or NULL if it is not found.
 */
EJDB.prototype.load = function(cname, oid, cb) {
    return this._impl.load(cname, oid, cb);
};

/**
 * Removes JSON object from the collection.
 *
 * @param {String} cname Name of collection
 * @param {String} oid Object identifier (OID)
 * @param {Function} cb  Callback function with arguments: (error)
 */
EJDB.prototype.remove = function(cname, oid, cb) {
    return this._impl.remove(cname, oid, cb);
};

/**
 * Execute query on collection.
 *
 * EJDB queries inspired by MongoDB (mongodb.org) and follows same philosophy.
 *
 *  - Supported queries:
 *      - Simple matching of String OR Number OR Array value:
 *          -   {'json.field.path' : 'val', ...}
 *      - $not Negate operation.
 *          -   {'json.field.path' : {'$not' : val}} //Field not equal to val
 *          -   {'json.field.path' : {'$not' : {'$begin' : prefix}}} //Field not begins with val
 *      - $begin String starts with prefix
 *          -   {'json.field.path' : {'$begin' : prefix}}
 *      - $gt, $gte (>, >=) and $lt, $lte for number types:
 *          -   {'json.field.path' : {'$gt' : number}, ...}
 *      - $bt Between for number types:
 *          -   {'json.field.path' : {'$bt' : [num1, num2]}}
 *      - $in String OR Number OR Array val matches to value in specified array:
 *          -   {'json.field.path' : {'$in' : [val1, val2, val3]}}
 *      - $nin - Not IN
 *      - $strand String tokens OR String array val matches all tokens in specified array:
 *          -   {'json.field.path' : {'$strand' : [val1, val2, val3]}}
 *      - $stror String tokens OR String array val matches any token in specified array:
 *          -   {'json.field.path' : {'$stror' : [val1, val2, val3]}}
 *      - $exists Field existence matching:
 *          -   {'json.field.path' : {'$exists' : true|false}}
 *
 *  NOTE: Negate operations: $not and $nin not using indexes
 *  so they can be slow in comparison to other matching operations.
 *
 *  NOTE: Only one index can be used in search query operation.
 *
 *  QUERY HINTS (specified by `hints` argument):
 *      - $max Maximum number in the result set
 *      - $skip Number of skipped results in the result set
 *      - $orderby Sorting order of query fields.
 *          Eg: ORDER BY field1 ASC, field2 DESC
 *          hints:    {
 *                      "$orderby" : {
 *                          "field1" : 1,
 *                          "field2" : -1
 *                      }
 *                    }
 *
 * Many C API query examples can be found in `tcejdb/testejdb/t2.c` test case.
 *                   *
 * To traverse selected records cursor object is used:
 *      - Cursor#next() Move cursor to the next record and returns true if next record exists.
 *      - Cursor#hasNext() Returns true if cursor can be placed to the next record.
 *      - Cursor#field(name) Retrieve value of the specified field of the current JSON object record.
 *      - Cursor#object() Retrieve whole JSON object with all fields.
 *      - Cursor#reset() Reset cursor to its initial state.
 *      - Cursor#length Read-only property: Number of records placed into cursor.
 *      - Cursor#pos Read/Write property: You can set cursor position: 0 <= pos < length
 *      - Cursor#close() Closes cursor and free cursor resources. Cursor cant be used in closed state.
 *
 * Call variations of find():
 *       - find(cname, qobj, cb)
 *       - find(cname, qobj, hints, cb)
 *       - find(cname, qobj, qobjarr, cb)
 *       - find(cname, qobj, qobjarr, hints, cb)
 *
 * @param {String} cname Name of collection
 * @param {Object} qobj Main JSON query object
 * @param {Array} [orarr] Array of additional OR query objects (joined with OR predicate).
 * @param {Object} [hints] JSON object with query hints.
 * @param {Function} cb Callback function with arguments: (error, cursor, count) where:
 *          `cursor`: Cursor object to traverse records
 *          `count`:  Total number of selected records
 */
EJDB.prototype.find = function(cname, qobj, orarr, hints, cb) {
    if (arguments.length == 4) {
        cb = hints;
        if (orarr && orarr.constructor === Array) {
            hints = {};
        } else {
            hints = orarr;
            orarr = [];
        }
    } else if (arguments.length == 3) {
        cb = orarr;
        orarr = [];
        hints = {};
    }
    if (typeof cb !== "function") {
        throw new Error("Callback 'cb' argument must be specified");
    }
    if (typeof cname !== "string") {
        throw new Error("Collection name 'cname' argument must be specified");
    }
    if (!hints || typeof hints !== "object") {
        hints = {};
    }
    if (!qobj || typeof qobj !== "object") {
        qobj = {};
    }
    return this._impl.query(cname,
            [qobj].concat(orarr, hints),
            (hints["$onlycount"] ? ejdblib.JBQRYCOUNT : 0),
            cb);
};

/**
 * Same as #find() but retrieves only one matching JSON object.
 *
 * Call variations of findOne():
 *       - findOne(cname, qobj, cb)
 *       - findOne(cname, qobj, hints, cb)
 *       - findOne(cname, qobj, qobjarr, cb)
 *       - findOne(cname, qobj, qobjarr, hints, cb)
 *
 * @param {String} cname Name of collection
 * @param {Object} qobj Main JSON query object
 * @param {Array} [orarr] Array of additional OR query objects (joined with OR predicate).
 * @param {Object} [hints] JSON object with query hints.
 * @param {Function} cb Callback function with arguments: (error, obj) where:
 *          `obj`:  Retrieved JSON object or NULL if it is not found.
 */

EJDB.prototype.findOne = function(cname, qobj, orarr, hints, cb) {
    if (arguments.length == 4) {
        cb = hints;
        if (orarr && orarr.constructor === Array) {
            hints = {};
        } else {
            hints = orarr;
            orarr = [];
        }
    } else if (arguments.length == 3) {
        cb = orarr;
        orarr = [];
        hints = {};
    }
    if (typeof cb !== "function") {
        throw new Error("Callback 'cb' argument must be specified");
    }
    if (typeof cname !== "string") {
        throw new Error("Collection name 'cname' argument must be specified");
    }
    if (!hints || typeof hints !== "object") {
        hints = {};
    }
    if (!qobj || typeof qobj !== "object") {
        qobj = {};
    }
    hints["$max"] = 1;
    return this._impl.query(cname, [qobj].concat(orarr, hints), 0,
            function(err, cursor) {
                if (err) {
                    cb(err);
                    return;
                }
                if (cursor.next()) {
                    try {
                        cb(null, cursor.object());
                    } finally {
                        cursor.close();
                    }
                } else {
                    cb(null, null);
                }
            });
};

/**
 * Convenient count(*) operation.
 *
 * Call variations of count():
 *       - count(cname, qobj, cb)
 *       - count(cname, qobj, hints, cb)
 *       - count(cname, qobj, qobjarr, cb)
 *       - count(cname, qobj, qobjarr, hints, cb)
 *
 * @param {String} cname Name of collection
 * @param {Object} qobj Main JSON query object
 * @param {Array} [orarr] Array of additional OR query objects (joined with OR predicate).
 * @param {Object} [hints] JSON object with query hints.
 * @param {Function} cb Callback function with arguments: (error, count) where:
 *          `count`:  Number of matching records.
 */
EJDB.prototype.count = function(cname, qobj, orarr, hints, cb) {
    if (arguments.length == 4) {
        cb = hints;
        if (orarr && orarr.constructor === Array) {
            hints = {};
        } else {
            hints = orarr;
            orarr = [];
        }
    } else if (arguments.length == 3) {
        cb = orarr;
        orarr = [];
        hints = {};
    }
    if (typeof cb !== "function") {
        throw new Error("Callback 'cb' argument must be specified");
    }
    if (typeof cname !== "string") {
        throw new Error("Collection name 'cname' argument must be specified");
    }
    if (!hints || typeof hints !== "object") {
        hints = {};
    }
    if (!qobj || typeof qobj !== "object") {
        qobj = {};
    }
    return this._impl.query(cname,
            [qobj].concat(orarr, hints),
            ejdblib.JBQRYCOUNT,
            function(err, cursor, count) {
                if (err) {
                    cb(err);
                    return;
                }
                cursor.close();
                cb(null, count);
            });
};

module.exports = EJDB;

