(function () {
    'use strict';

    class AbstractView {
        constructor() {
            this.app = document.getElementById('root');
        }
        
        setTitle(title) {
            document.title = title;
        }
        
        render() {
            return;
        }

        destroy() {
            return;
        }
    }

    const PATH_SEPARATOR = '.';
    const TARGET = Symbol('target');
    const UNSUBSCRIBE = Symbol('unsubscribe');

    function isBuiltinWithMutableMethods(value) {
    	return value instanceof Date
    		|| value instanceof Set
    		|| value instanceof Map
    		|| value instanceof WeakSet
    		|| value instanceof WeakMap
    		|| ArrayBuffer.isView(value);
    }

    function isBuiltinWithoutMutableMethods(value) {
    	return (typeof value === 'object' ? value === null : typeof value !== 'function') || value instanceof RegExp;
    }

    var isArray = Array.isArray;

    function isSymbol(value) {
    	return typeof value === 'symbol';
    }

    const path = {
    	after(path, subPath) {
    		if (isArray(path)) {
    			return path.slice(subPath.length);
    		}

    		if (subPath === '') {
    			return path;
    		}

    		return path.slice(subPath.length + 1);
    	},
    	concat(path, key) {
    		if (isArray(path)) {
    			path = [...path];

    			if (key) {
    				path.push(key);
    			}

    			return path;
    		}

    		if (key && key.toString !== undefined) {
    			if (path !== '') {
    				path += PATH_SEPARATOR;
    			}

    			if (isSymbol(key)) {
    				return path + key.toString();
    			}

    			return path + key;
    		}

    		return path;
    	},
    	initial(path) {
    		if (isArray(path)) {
    			return path.slice(0, -1);
    		}

    		if (path === '') {
    			return path;
    		}

    		const index = path.lastIndexOf(PATH_SEPARATOR);

    		if (index === -1) {
    			return '';
    		}

    		return path.slice(0, index);
    	},
    	last(path) {
    		if (isArray(path)) {
    			return path.at(-1) ?? '';
    		}

    		if (path === '') {
    			return path;
    		}

    		const index = path.lastIndexOf(PATH_SEPARATOR);

    		if (index === -1) {
    			return path;
    		}

    		return path.slice(index + 1);
    	},
    	walk(path, callback) {
    		if (isArray(path)) {
    			for (const key of path) {
    				callback(key);
    			}
    		} else if (path !== '') {
    			let position = 0;
    			let index = path.indexOf(PATH_SEPARATOR);

    			if (index === -1) {
    				callback(path);
    			} else {
    				while (position < path.length) {
    					if (index === -1) {
    						index = path.length;
    					}

    					callback(path.slice(position, index));

    					position = index + 1;
    					index = path.indexOf(PATH_SEPARATOR, position);
    				}
    			}
    		}
    	},
    	get(object, path) {
    		this.walk(path, key => {
    			if (object) {
    				object = object[key];
    			}
    		});

    		return object;
    	},
    	isSubPath(path, subPath) {
    		if (isArray(path)) {
    			if (path.length < subPath.length) {
    				return false;
    			}

    			// eslint-disable-next-line unicorn/no-for-loop
    			for (let i = 0; i < subPath.length; i++) {
    				if (path[i] !== subPath[i]) {
    					return false;
    				}
    			}

    			return true;
    		}

    		if (path.length < subPath.length) {
    			return false;
    		}

    		if (path === subPath) {
    			return true;
    		}

    		if (path.startsWith(subPath)) {
    			return path[subPath.length] === PATH_SEPARATOR;
    		}

    		return false;
    	},
    	isRootPath(path) {
    		if (isArray(path)) {
    			return path.length === 0;
    		}

    		return path === '';
    	},
    };

    function isIterator(value) {
    	return typeof value === 'object' && typeof value.next === 'function';
    }

    // eslint-disable-next-line max-params
    function wrapIterator(iterator, target, thisArgument, applyPath, prepareValue) {
    	const originalNext = iterator.next;

    	if (target.name === 'entries') {
    		iterator.next = function () {
    			const result = originalNext.call(this);

    			if (result.done === false) {
    				result.value[0] = prepareValue(
    					result.value[0],
    					target,
    					result.value[0],
    					applyPath,
    				);
    				result.value[1] = prepareValue(
    					result.value[1],
    					target,
    					result.value[0],
    					applyPath,
    				);
    			}

    			return result;
    		};
    	} else if (target.name === 'values') {
    		const keyIterator = thisArgument[TARGET].keys();

    		iterator.next = function () {
    			const result = originalNext.call(this);

    			if (result.done === false) {
    				result.value = prepareValue(
    					result.value,
    					target,
    					keyIterator.next().value,
    					applyPath,
    				);
    			}

    			return result;
    		};
    	} else {
    		iterator.next = function () {
    			const result = originalNext.call(this);

    			if (result.done === false) {
    				result.value = prepareValue(
    					result.value,
    					target,
    					result.value,
    					applyPath,
    				);
    			}

    			return result;
    		};
    	}

    	return iterator;
    }

    function ignoreProperty(cache, options, property) {
    	return cache.isUnsubscribed
    		|| (options.ignoreSymbols && isSymbol(property))
    		|| (options.ignoreUnderscores && property.charAt(0) === '_')
    		|| ('ignoreKeys' in options && options.ignoreKeys.includes(property));
    }

    /**
    @class Cache
    @private
    */
    class Cache {
    	constructor(equals) {
    		this._equals = equals;
    		this._proxyCache = new WeakMap();
    		this._pathCache = new WeakMap();
    		this.isUnsubscribed = false;
    	}

    	_getDescriptorCache() {
    		if (this._descriptorCache === undefined) {
    			this._descriptorCache = new WeakMap();
    		}

    		return this._descriptorCache;
    	}

    	_getProperties(target) {
    		const descriptorCache = this._getDescriptorCache();
    		let properties = descriptorCache.get(target);

    		if (properties === undefined) {
    			properties = {};
    			descriptorCache.set(target, properties);
    		}

    		return properties;
    	}

    	_getOwnPropertyDescriptor(target, property) {
    		if (this.isUnsubscribed) {
    			return Reflect.getOwnPropertyDescriptor(target, property);
    		}

    		const properties = this._getProperties(target);
    		let descriptor = properties[property];

    		if (descriptor === undefined) {
    			descriptor = Reflect.getOwnPropertyDescriptor(target, property);
    			properties[property] = descriptor;
    		}

    		return descriptor;
    	}

    	getProxy(target, path, handler, proxyTarget) {
    		if (this.isUnsubscribed) {
    			return target;
    		}

    		const reflectTarget = target[proxyTarget];
    		const source = reflectTarget ?? target;

    		this._pathCache.set(source, path);

    		let proxy = this._proxyCache.get(source);

    		if (proxy === undefined) {
    			proxy = reflectTarget === undefined
    				? new Proxy(target, handler)
    				: target;

    			this._proxyCache.set(source, proxy);
    		}

    		return proxy;
    	}

    	getPath(target) {
    		return this.isUnsubscribed ? undefined : this._pathCache.get(target);
    	}

    	isDetached(target, object) {
    		return !Object.is(target, path.get(object, this.getPath(target)));
    	}

    	defineProperty(target, property, descriptor) {
    		if (!Reflect.defineProperty(target, property, descriptor)) {
    			return false;
    		}

    		if (!this.isUnsubscribed) {
    			this._getProperties(target)[property] = descriptor;
    		}

    		return true;
    	}

    	setProperty(target, property, value, receiver, previous) { // eslint-disable-line max-params
    		if (!this._equals(previous, value) || !(property in target)) {
    			const descriptor = this._getOwnPropertyDescriptor(target, property);

    			if (descriptor !== undefined && 'set' in descriptor) {
    				return Reflect.set(target, property, value, receiver);
    			}

    			return Reflect.set(target, property, value);
    		}

    		return true;
    	}

    	deleteProperty(target, property, previous) {
    		if (Reflect.deleteProperty(target, property)) {
    			if (!this.isUnsubscribed) {
    				const properties = this._getDescriptorCache().get(target);

    				if (properties) {
    					delete properties[property];
    					this._pathCache.delete(previous);
    				}
    			}

    			return true;
    		}

    		return false;
    	}

    	isSameDescriptor(a, target, property) {
    		const b = this._getOwnPropertyDescriptor(target, property);

    		return a !== undefined
    			&& b !== undefined
    			&& Object.is(a.value, b.value)
    			&& (a.writable || false) === (b.writable || false)
    			&& (a.enumerable || false) === (b.enumerable || false)
    			&& (a.configurable || false) === (b.configurable || false)
    			&& a.get === b.get
    			&& a.set === b.set;
    	}

    	isGetInvariant(target, property) {
    		const descriptor = this._getOwnPropertyDescriptor(target, property);

    		return descriptor !== undefined
    			&& descriptor.configurable !== true
    			&& descriptor.writable !== true;
    	}

    	unsubscribe() {
    		this._descriptorCache = null;
    		this._pathCache = null;
    		this._proxyCache = null;
    		this.isUnsubscribed = true;
    	}
    }

    function isObject(value) {
    	return toString.call(value) === '[object Object]';
    }

    function isDiffCertain() {
    	return true;
    }

    function isDiffArrays(clone, value) {
    	return clone.length !== value.length || clone.some((item, index) => value[index] !== item);
    }

    const IMMUTABLE_OBJECT_METHODS = new Set([
    	'hasOwnProperty',
    	'isPrototypeOf',
    	'propertyIsEnumerable',
    	'toLocaleString',
    	'toString',
    	'valueOf',
    ]);

    const IMMUTABLE_ARRAY_METHODS = new Set([
    	'concat',
    	'includes',
    	'indexOf',
    	'join',
    	'keys',
    	'lastIndexOf',
    ]);

    const MUTABLE_ARRAY_METHODS = {
    	push: isDiffCertain,
    	pop: isDiffCertain,
    	shift: isDiffCertain,
    	unshift: isDiffCertain,
    	copyWithin: isDiffArrays,
    	reverse: isDiffArrays,
    	sort: isDiffArrays,
    	splice: isDiffArrays,
    	flat: isDiffArrays,
    	fill: isDiffArrays,
    };

    const HANDLED_ARRAY_METHODS = new Set([
    	...IMMUTABLE_OBJECT_METHODS,
    	...IMMUTABLE_ARRAY_METHODS,
    	...Object.keys(MUTABLE_ARRAY_METHODS),
    ]);

    function isDiffSets(clone, value) {
    	if (clone.size !== value.size) {
    		return true;
    	}

    	for (const element of clone) {
    		if (!value.has(element)) {
    			return true;
    		}
    	}

    	return false;
    }

    const COLLECTION_ITERATOR_METHODS = [
    	'keys',
    	'values',
    	'entries',
    ];

    const IMMUTABLE_SET_METHODS = new Set([
    	'has',
    	'toString',
    ]);

    const MUTABLE_SET_METHODS = {
    	add: isDiffSets,
    	clear: isDiffSets,
    	delete: isDiffSets,
    	forEach: isDiffSets,
    };

    const HANDLED_SET_METHODS = new Set([
    	...IMMUTABLE_SET_METHODS,
    	...Object.keys(MUTABLE_SET_METHODS),
    	...COLLECTION_ITERATOR_METHODS,
    ]);

    function isDiffMaps(clone, value) {
    	if (clone.size !== value.size) {
    		return true;
    	}

    	let bValue;
    	for (const [key, aValue] of clone) {
    		bValue = value.get(key);

    		if (bValue !== aValue || (bValue === undefined && !value.has(key))) {
    			return true;
    		}
    	}

    	return false;
    }

    const IMMUTABLE_MAP_METHODS = new Set([...IMMUTABLE_SET_METHODS, 'get']);

    const MUTABLE_MAP_METHODS = {
    	set: isDiffMaps,
    	clear: isDiffMaps,
    	delete: isDiffMaps,
    	forEach: isDiffMaps,
    };

    const HANDLED_MAP_METHODS = new Set([
    	...IMMUTABLE_MAP_METHODS,
    	...Object.keys(MUTABLE_MAP_METHODS),
    	...COLLECTION_ITERATOR_METHODS,
    ]);

    class CloneObject {
    	constructor(value, path, argumentsList, hasOnValidate) {
    		this._path = path;
    		this._isChanged = false;
    		this._clonedCache = new Set();
    		this._hasOnValidate = hasOnValidate;
    		this._changes = hasOnValidate ? [] : null;

    		this.clone = path === undefined ? value : this._shallowClone(value);
    	}

    	static isHandledMethod(name) {
    		return IMMUTABLE_OBJECT_METHODS.has(name);
    	}

    	_shallowClone(value) {
    		let clone = value;

    		if (isObject(value)) {
    			clone = {...value};
    		} else if (isArray(value) || ArrayBuffer.isView(value)) {
    			clone = [...value];
    		} else if (value instanceof Date) {
    			clone = new Date(value);
    		} else if (value instanceof Set) {
    			clone = new Set([...value].map(item => this._shallowClone(item)));
    		} else if (value instanceof Map) {
    			clone = new Map();

    			for (const [key, item] of value.entries()) {
    				clone.set(key, this._shallowClone(item));
    			}
    		}

    		this._clonedCache.add(clone);

    		return clone;
    	}

    	preferredThisArg(isHandledMethod, name, thisArgument, thisProxyTarget) {
    		if (isHandledMethod) {
    			if (isArray(thisProxyTarget)) {
    				this._onIsChanged = MUTABLE_ARRAY_METHODS[name];
    			} else if (thisProxyTarget instanceof Set) {
    				this._onIsChanged = MUTABLE_SET_METHODS[name];
    			} else if (thisProxyTarget instanceof Map) {
    				this._onIsChanged = MUTABLE_MAP_METHODS[name];
    			}

    			return thisProxyTarget;
    		}

    		return thisArgument;
    	}

    	update(fullPath, property, value) {
    		const changePath = path.after(fullPath, this._path);

    		if (property !== 'length') {
    			let object = this.clone;

    			path.walk(changePath, key => {
    				if (object?.[key]) {
    					if (!this._clonedCache.has(object[key])) {
    						object[key] = this._shallowClone(object[key]);
    					}

    					object = object[key];
    				}
    			});

    			if (this._hasOnValidate) {
    				this._changes.push({
    					path: changePath,
    					property,
    					previous: value,
    				});
    			}

    			if (object?.[property]) {
    				object[property] = value;
    			}
    		}

    		this._isChanged = true;
    	}

    	undo(object) {
    		let change;

    		for (let index = this._changes.length - 1; index !== -1; index--) {
    			change = this._changes[index];

    			path.get(object, change.path)[change.property] = change.previous;
    		}
    	}

    	isChanged(value) {
    		return this._onIsChanged === undefined
    			? this._isChanged
    			: this._onIsChanged(this.clone, value);
    	}

    	isPathApplicable(changePath) {
    		return path.isRootPath(this._path) || path.isSubPath(changePath, this._path);
    	}
    }

    class CloneArray extends CloneObject {
    	static isHandledMethod(name) {
    		return HANDLED_ARRAY_METHODS.has(name);
    	}
    }

    class CloneDate extends CloneObject {
    	undo(object) {
    		object.setTime(this.clone.getTime());
    	}

    	isChanged(value, equals) {
    		return !equals(this.clone.valueOf(), value.valueOf());
    	}
    }

    class CloneSet extends CloneObject {
    	static isHandledMethod(name) {
    		return HANDLED_SET_METHODS.has(name);
    	}

    	undo(object) {
    		for (const value of this.clone) {
    			object.add(value);
    		}

    		for (const value of object) {
    			if (!this.clone.has(value)) {
    				object.delete(value);
    			}
    		}
    	}
    }

    class CloneMap extends CloneObject {
    	static isHandledMethod(name) {
    		return HANDLED_MAP_METHODS.has(name);
    	}

    	undo(object) {
    		for (const [key, value] of this.clone.entries()) {
    			object.set(key, value);
    		}

    		for (const key of object.keys()) {
    			if (!this.clone.has(key)) {
    				object.delete(key);
    			}
    		}
    	}
    }

    class CloneWeakSet extends CloneObject {
    	constructor(value, path, argumentsList, hasOnValidate) {
    		super(undefined, path, argumentsList, hasOnValidate);

    		this._argument1 = argumentsList[0];
    		this._weakValue = value.has(this._argument1);
    	}

    	isChanged(value) {
    		return this._weakValue !== value.has(this._argument1);
    	}

    	undo(object) {
    		if (this._weakValue && !object.has(this._argument1)) {
    			object.add(this._argument1);
    		} else {
    			object.delete(this._argument1);
    		}
    	}
    }

    class CloneWeakMap extends CloneObject {
    	constructor(value, path, argumentsList, hasOnValidate) {
    		super(undefined, path, argumentsList, hasOnValidate);

    		this._weakKey = argumentsList[0];
    		this._weakHas = value.has(this._weakKey);
    		this._weakValue = value.get(this._weakKey);
    	}

    	isChanged(value) {
    		return this._weakValue !== value.get(this._weakKey);
    	}

    	undo(object) {
    		const weakHas = object.has(this._weakKey);

    		if (this._weakHas && !weakHas) {
    			object.set(this._weakKey, this._weakValue);
    		} else if (!this._weakHas && weakHas) {
    			object.delete(this._weakKey);
    		} else if (this._weakValue !== object.get(this._weakKey)) {
    			object.set(this._weakKey, this._weakValue);
    		}
    	}
    }

    class SmartClone {
    	constructor(hasOnValidate) {
    		this._stack = [];
    		this._hasOnValidate = hasOnValidate;
    	}

    	static isHandledType(value) {
    		return isObject(value)
    			|| isArray(value)
    			|| isBuiltinWithMutableMethods(value);
    	}

    	static isHandledMethod(target, name) {
    		if (isObject(target)) {
    			return CloneObject.isHandledMethod(name);
    		}

    		if (isArray(target)) {
    			return CloneArray.isHandledMethod(name);
    		}

    		if (target instanceof Set) {
    			return CloneSet.isHandledMethod(name);
    		}

    		if (target instanceof Map) {
    			return CloneMap.isHandledMethod(name);
    		}

    		return isBuiltinWithMutableMethods(target);
    	}

    	get isCloning() {
    		return this._stack.length > 0;
    	}

    	start(value, path, argumentsList) {
    		let CloneClass = CloneObject;

    		if (isArray(value)) {
    			CloneClass = CloneArray;
    		} else if (value instanceof Date) {
    			CloneClass = CloneDate;
    		} else if (value instanceof Set) {
    			CloneClass = CloneSet;
    		} else if (value instanceof Map) {
    			CloneClass = CloneMap;
    		} else if (value instanceof WeakSet) {
    			CloneClass = CloneWeakSet;
    		} else if (value instanceof WeakMap) {
    			CloneClass = CloneWeakMap;
    		}

    		this._stack.push(new CloneClass(value, path, argumentsList, this._hasOnValidate));
    	}

    	update(fullPath, property, value) {
    		this._stack.at(-1).update(fullPath, property, value);
    	}

    	preferredThisArg(target, thisArgument, thisProxyTarget) {
    		const {name} = target;
    		const isHandledMethod = SmartClone.isHandledMethod(thisProxyTarget, name);

    		return this._stack.at(-1)
    			.preferredThisArg(isHandledMethod, name, thisArgument, thisProxyTarget);
    	}

    	isChanged(isMutable, value, equals) {
    		return this._stack.at(-1).isChanged(isMutable, value, equals);
    	}

    	isPartOfClone(changePath) {
    		return this._stack.at(-1).isPathApplicable(changePath);
    	}

    	undo(object) {
    		if (this._previousClone !== undefined) {
    			this._previousClone.undo(object);
    		}
    	}

    	stop() {
    		this._previousClone = this._stack.pop();

    		return this._previousClone.clone;
    	}
    }

    /* eslint-disable unicorn/prefer-spread */

    const defaultOptions = {
    	equals: Object.is,
    	isShallow: false,
    	pathAsArray: false,
    	ignoreSymbols: false,
    	ignoreUnderscores: false,
    	ignoreDetached: false,
    	details: false,
    };

    const onChange = (object, onChange, options = {}) => {
    	options = {
    		...defaultOptions,
    		...options,
    	};

    	const proxyTarget = Symbol('ProxyTarget');
    	const {equals, isShallow, ignoreDetached, details} = options;
    	const cache = new Cache(equals);
    	const hasOnValidate = typeof options.onValidate === 'function';
    	const smartClone = new SmartClone(hasOnValidate);

    	// eslint-disable-next-line max-params
    	const validate = (target, property, value, previous, applyData) => !hasOnValidate
    		|| smartClone.isCloning
    		|| options.onValidate(path.concat(cache.getPath(target), property), value, previous, applyData) === true;

    	const handleChangeOnTarget = (target, property, value, previous) => {
    		if (
    			!ignoreProperty(cache, options, property)
    			&& !(ignoreDetached && cache.isDetached(target, object))
    		) {
    			handleChange(cache.getPath(target), property, value, previous);
    		}
    	};

    	// eslint-disable-next-line max-params
    	const handleChange = (changePath, property, value, previous, applyData) => {
    		if (smartClone.isCloning && smartClone.isPartOfClone(changePath)) {
    			smartClone.update(changePath, property, previous);
    		} else {
    			onChange(path.concat(changePath, property), value, previous, applyData);
    		}
    	};

    	const getProxyTarget = value => value
    		? (value[proxyTarget] ?? value)
    		: value;

    	const prepareValue = (value, target, property, basePath) => {
    		if (
    			isBuiltinWithoutMutableMethods(value)
    			|| property === 'constructor'
    			|| (isShallow && !SmartClone.isHandledMethod(target, property))
    			|| ignoreProperty(cache, options, property)
    			|| cache.isGetInvariant(target, property)
    			|| (ignoreDetached && cache.isDetached(target, object))
    		) {
    			return value;
    		}

    		if (basePath === undefined) {
    			basePath = cache.getPath(target);
    		}

    		/*
      		Check for circular references.

      		If the value already has a corresponding path/proxy,
    		and if the path corresponds to one of the parents,
    		then we are on a circular case, where the child is pointing to their parent.
    		In this case we return the proxy object with the shortest path.
      		*/
    		const childPath = path.concat(basePath, property);
    		const existingPath = cache.getPath(value);

    		if (existingPath && isSameObjectTree(childPath, existingPath)) {
    			// We are on the same object tree but deeper, so we use the parent path.
    			return cache.getProxy(value, existingPath, handler, proxyTarget);
    		}

    		return cache.getProxy(value, childPath, handler, proxyTarget);
    	};

    	/*
    	Returns true if `childPath` is a subpath of `existingPath`
    	(if childPath starts with existingPath). Otherwise, it returns false.

     	It also returns false if the 2 paths are identical.

     	For example:
    	- childPath    = group.layers.0.parent.layers.0.value
    	- existingPath = group.layers.0.parent
    	*/
    	const isSameObjectTree = (childPath, existingPath) => {
    		if (isSymbol(childPath) || childPath.length <= existingPath.length) {
    			return false;
    		}

    		if (isArray(existingPath) && existingPath.length === 0) {
    			return false;
    		}

    		const childParts = isArray(childPath) ? childPath : childPath.split(PATH_SEPARATOR);
    		const existingParts = isArray(existingPath) ? existingPath : existingPath.split(PATH_SEPARATOR);

    		if (childParts.length <= existingParts.length) {
    			return false;
    		}

    		return !(existingParts.some((part, index) => part !== childParts[index]));
    	};

    	const handler = {
    		get(target, property, receiver) {
    			if (isSymbol(property)) {
    				if (property === proxyTarget || property === TARGET) {
    					return target;
    				}

    				if (
    					property === UNSUBSCRIBE
    					&& !cache.isUnsubscribed
    					&& cache.getPath(target).length === 0
    				) {
    					cache.unsubscribe();
    					return target;
    				}
    			}

    			const value = isBuiltinWithMutableMethods(target)
    				? Reflect.get(target, property)
    				: Reflect.get(target, property, receiver);

    			return prepareValue(value, target, property);
    		},

    		set(target, property, value, receiver) {
    			value = getProxyTarget(value);

    			const reflectTarget = target[proxyTarget] ?? target;
    			const previous = reflectTarget[property];

    			if (equals(previous, value) && property in target) {
    				return true;
    			}

    			const isValid = validate(target, property, value, previous);

    			if (
    				isValid
    				&& cache.setProperty(reflectTarget, property, value, receiver, previous)
    			) {
    				handleChangeOnTarget(target, property, target[property], previous);

    				return true;
    			}

    			return !isValid;
    		},

    		defineProperty(target, property, descriptor) {
    			if (!cache.isSameDescriptor(descriptor, target, property)) {
    				const previous = target[property];

    				if (
    					validate(target, property, descriptor.value, previous)
    					&& cache.defineProperty(target, property, descriptor, previous)
    				) {
    					handleChangeOnTarget(target, property, descriptor.value, previous);
    				}
    			}

    			return true;
    		},

    		deleteProperty(target, property) {
    			if (!Reflect.has(target, property)) {
    				return true;
    			}

    			const previous = Reflect.get(target, property);
    			const isValid = validate(target, property, undefined, previous);

    			if (
    				isValid
    				&& cache.deleteProperty(target, property, previous)
    			) {
    				handleChangeOnTarget(target, property, undefined, previous);

    				return true;
    			}

    			return !isValid;
    		},

    		apply(target, thisArg, argumentsList) {
    			const thisProxyTarget = thisArg[proxyTarget] ?? thisArg;

    			if (cache.isUnsubscribed) {
    				return Reflect.apply(target, thisProxyTarget, argumentsList);
    			}

    			if (
    				(details === false
    					|| (details !== true && !details.includes(target.name)))
    				&& SmartClone.isHandledType(thisProxyTarget)
    			) {
    				let applyPath = path.initial(cache.getPath(target));
    				const isHandledMethod = SmartClone.isHandledMethod(thisProxyTarget, target.name);

    				smartClone.start(thisProxyTarget, applyPath, argumentsList);

    				let result = Reflect.apply(
    					target,
    					smartClone.preferredThisArg(target, thisArg, thisProxyTarget),
    					isHandledMethod
    						? argumentsList.map(argument => getProxyTarget(argument))
    						: argumentsList,
    				);

    				const isChanged = smartClone.isChanged(thisProxyTarget, equals);
    				const previous = smartClone.stop();

    				if (SmartClone.isHandledType(result) && isHandledMethod) {
    					if (thisArg instanceof Map && target.name === 'get') {
    						applyPath = path.concat(applyPath, argumentsList[0]);
    					}

    					result = cache.getProxy(result, applyPath, handler);
    				}

    				if (isChanged) {
    					const applyData = {
    						name: target.name,
    						args: argumentsList,
    						result,
    					};
    					const changePath = smartClone.isCloning
    						? path.initial(applyPath)
    						: applyPath;
    					const property = smartClone.isCloning
    						? path.last(applyPath)
    						: '';

    					if (validate(path.get(object, changePath), property, thisProxyTarget, previous, applyData)) {
    						handleChange(changePath, property, thisProxyTarget, previous, applyData);
    					} else {
    						smartClone.undo(thisProxyTarget);
    					}
    				}

    				if (
    					(thisArg instanceof Map || thisArg instanceof Set)
    					&& isIterator(result)
    				) {
    					return wrapIterator(result, target, thisArg, applyPath, prepareValue);
    				}

    				return result;
    			}

    			return Reflect.apply(target, thisArg, argumentsList);
    		},
    	};

    	const proxy = cache.getProxy(object, options.pathAsArray ? [] : '', handler);
    	onChange = onChange.bind(proxy);

    	if (hasOnValidate) {
    		options.onValidate = options.onValidate.bind(proxy);
    	}

    	return proxy;
    };

    onChange.target = proxy => proxy?.[TARGET] ?? proxy;
    onChange.unsubscribe = proxy => proxy?.[UNSUBSCRIBE] ?? proxy;

    class DivComponent {
        constructor() {
            this.el = document.createElement('div'); // Создание элемента div
        }

        /**
         * Метод для получения элемента div.
         * @returns {HTMLElement} Элемент div.
         */
        getElement() {
            return this.el;
        }

        /**
         * Метод для добавления контента в элемент.
         * @param {string} content - HTML-код или текст для добавления.
         */
        setContent(content) {
            this.el.innerHTML = content; // Установка внутреннего HTML-кода
        }

        /**
         * Метод для добавления класса к элементу.
         * @param {string} className - Имя класса, который будет добавлен.
         */
        addClass(className) {
            this.el.classList.add(className); // Добавление класса
        }

        /**
         * Метод для рендеринга компонента. 
         * Переопределяется в дочерних классах, если требуется.
         */
        render() {
            return this.el; // Возвращает элемент div
        }
    }

    class Header extends DivComponent {
        constructor(appState) {
            super();
            this.appState = appState;
        }

        render() {
            this.el.classList.add('header');
            this.el.innerHTML = `
            <div>
                <img src="/static/logo.png" alt="Логотип" href="#"/>
            </div>
            <div class="menu">
                <a class="menu__item" href="#">
                    <img src="/static/icons/food.svg" alt="Меню иконка" />
                    Меню
                </a>
                <a class="menu__item" href="#cart">
                    <img src="/static/icons/cart.svg" alt="Корзина иконка" />
                    Корзина
                    <div class="menu__counter">
                    ${this.appState?.cart ? this.appState.cart.length : 0}
                    </div>
                </a>
            </div>
        `;
            return this.el;
        }
    }

    class Card extends DivComponent {
        constructor(appState, cardState) {
            super();
            this.appState = appState;
            this.cardState = cardState;
        }

        #addToCart() {
            this.appState.cart.push(this.cardState);
        }

        #deleteFromCart() {
            this.appState.cart = this.appState.cart.filter(
                b => b._id !== this.cardState._id
            );
        }

        render() {
            this.el.classList.add('card');
            const existInCart = this.appState.cart.find(b => b._id == this.cardState._id);
            this.el.innerHTML = `
            <div class="card__image" >
                <a href="#product?id=${this.cardState._id}">
                    <img src="images/${this.cardState.image}.jpg" alt="Обложка" />
                </a>
            </div>
            <div class="card__info">
                <div class="card__name">
                    ${this.cardState.name}
                </div>
                <div class="card__price">
                    ${this.cardState.price} Руб
                </div>
                <div class="card__footer">
                    <button class="button__add">
                        ${existInCart 
                            ? '<img src="/static/icons/cart-remove.svg" />'
                            : '<img src="/static/icons/cart.svg" />'
                        }
                    </button>
                </div>
            </div>
        `;
            if (existInCart) {
                this.el.querySelector('button').addEventListener('click', this.#deleteFromCart.bind(this));
            } else {
                this.el.querySelector('button').addEventListener('click', this.#addToCart.bind(this));
            }
            this.el.querySelector('.card__image').addEventListener('click', (e) => {
                e.stopPropagation();
        });
            return this.el;
        }
    }

    class Preloader extends DivComponent {
        constructor() {
            super();
        }

        render() {
            this.el.innerHTML = `
            <h1 class="h1">Приятного аппетита</h1>
            <div id="cooking">
                <div class="bubble"></div>
                <div class="bubble"></div>
                <div class="bubble"></div>
                <div class="bubble"></div>
                <div class="bubble"></div>
                <div id="area">
                    <div id="sides">
                        <div id="pan"></div>
                        <div id="handle"></div>
                    </div>
                    <div id="pancake">
                        <div id="pastry"></div>
                    </div>
                </div>
            </div>
        `;
            return this.el;
        }
    }

    class CardList extends DivComponent {
        constructor(appState, parentState) {
            super();
            this.appState = appState;
            this.parentState = parentState;
        }

        prevPage() {
            if (this.parentState.offset > 0) {
                this.parentState.offset--;
                this.render(); 
            }
        }

        nextPage() {
            if (this.parentState.offset < this.parentState.countPage - 1) {
                this.parentState.offset++;
                this.render(); 
            }
        }

        render() {
            if (this.parentState.loading) {
                const preloader = new Preloader();
                this.el.append(preloader.render());
                return this.el;
            }

            this.el.innerHTML = '';

            const cardGrid = document.createElement('div');
            cardGrid.classList.add('card_grid');
            this.el.append(cardGrid);

            const start = this.parentState.offset * this.parentState.countElInPage;
            const end = start + this.parentState.countElInPage;

            let limitElInPage = this.parentState.list.slice(start, end); 
            
            if(limitElInPage.length == 0) {
                limitElInPage = this.parentState.list;
            }

            for (const card of limitElInPage) {
                cardGrid.append(new Card(this.appState, card).render());
            }

            const pagination = document.createElement('div');

            if (this.parentState.list.length > 0 && location.hash !== "#cart") {
                pagination.classList.add('card__pagination');

                const prevButton = document.createElement('button');
                prevButton.classList.add('card__pagination_prev');
                prevButton.innerHTML = `
                <img src="static/arrow-back.svg" />
                Предыдущая страница
            `;
                prevButton.addEventListener('click', this.prevPage.bind(this));

                if (this.parentState.offset === 0) {
                    prevButton.classList.add('hidden');
                }
                pagination.append(prevButton);

                const nextButton = document.createElement('button');
                nextButton.classList.add('card__pagination_next');
                nextButton.innerHTML = `
                Следующая страница
                <img src="static/arrow-forth.svg" />
            `;
                nextButton.addEventListener('click', this.nextPage.bind(this));

                if (this.parentState.offset >= this.parentState.countPage - 1) {
                    nextButton.classList.add('hidden');
                }
                pagination.append(nextButton);
            }

            this.el.append(pagination);
            return this.el;
        }
    }

    class CartView extends AbstractView {
        constructor(appState) {
            super();
            this.appState = appState;
            this.appState = onChange(this.appState, this.appStateHook.bind(this));
            this.setTitle('Корзина');
        }

        destroy() {
            onChange.unsubscribe(this.appState);
        }

        appStateHook(path) {
            if (path === 'cart') {
                this.render();
            }
        }

        render() {
            const main = document.createElement('div');
            main.innerHTML = `
            <h1>Корзина</h1>
        `;
            main.append(new CardList(this.appState, { list: this.appState.cart }).render());
            this.app.innerHTML = '';
            this.app.append(main);
            this.renderHeader();
        }

        renderHeader() {
            const header = new Header(this.appState).render();
            this.app.prepend(header);
        }
    }

    class Search extends DivComponent {
        constructor(state) {
            super();
            this.state = state;
        }

        search() {
            const value = this.el.querySelector('input').value;
            this.state.searchQuery = value.toLowerCase();
        }

        render() {
            this.el.classList.add('search');
            this.el.innerHTML = `
        <div class="search__wrapper">
            <input 
                type="text"
                placeholder="Поиск..."
                class="search__input"
                value="${this.state.searchQuery ? this.state.searchQuery : ''}"
            />
            <img src="static/icons/search.svg" alt="Иконка поиска" />
        </div>
        <button aria-label="Искать">
            <img src="static/icons/search-gold.svg" alt="Иконка поиска" />
        </button>
        `;
            this.el.querySelector('button').addEventListener('click', this.search.bind(this));
            this.el.querySelector('input').addEventListener('keydown', (event) => {
                if (event.code === 'Enter') {
                    this.search();
                }
            });
            return this.el;
        }
    }

    const categoriesDB = [
        {
            "_id": 0,
            "name": "Все",
        },
        {
            "_id": 1,
            "name": "Бургеры",
        },
        {
            "_id": 2,
            "name": "Пиццы",
        },
        {
        "_id": 3,
        "name": "Суши",
        },
        {
            "_id": 4,
            "name": "Роллы",
        },
        {
            "_id": 5,
            "name": "Фри",
        },
        {
            "_id": 6,
            "name": "Мангал",
        },
        {
            "_id": 7,
            "name": "Салаты",
        },
        {
            "_id": 8,
            "name": "Напитки",
        }
    ];

    class Category extends DivComponent {
        constructor(state) {
            super();
            this.state = state;
        }

        addOrRemoveClassActive(e) {
            if (e.target.classList.contains('active')) {
                return;
            }

            const navLinks = document.querySelectorAll('.nav-link');
            
            for (const navLink of navLinks) {
                navLink.classList.remove('active');
            }
            e.target.classList.add('active');
            this.state.category_id = Number(e.target.getAttribute('data-id'));
        }

        render() {
            const nav = document.createElement('nav');
            const ul = document.createElement('ul');

            for (const cat of categoriesDB) {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.innerHTML = cat.name;
                a.classList.add('nav-link', ...(cat._id === this.state.category_id ? ['active'] : []));
                a.setAttribute('data-id', cat._id);
                li.append(a);
                ul.append(li);
            }
            ul.addEventListener('click', this.addOrRemoveClassActive.bind(this));
            nav.append(ul);
            this.el.append(nav);
            return this.el;
        }
    }

    const productsDB = [
        {
            "_id": "66f92ce1499098170001aa1e",
            "name": "ГОЛДЕН ЧИКЕН",
            "category": 1,
            "description": "Изысканное блюдо Голден-Чикен - нежное куриное филе в хрустящей золотистой панировке, подается с сочным овощным гарниром. Роскошный вкус для ценителей!",
            "image": [
              "66f92cd6499098170001aa1b"
            ],
            "price": 118,
            "_created": "2024-09-29T10:33:05.979Z",
            "_changed": "2024-09-30T20:07:20.354Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 4
          },
          {
            "_id": "66f92bbc499098170001aa17",
            "name": "ЧИКЕН БУРГЕР",
            "category": 1,
            "description": "Побалуйте себя незабываемыми закусками с нашим сочным куриным бургером. Мягкая булочка с хрустящей куриной котлетой, свежими овощами и пикантным соусом. Наслаждаться!",
            "image": [
              "66f92ba6499098170001aa14"
            ],
            "price": 92,
            "_created": "2024-09-29T10:28:12.129Z",
            "_changed": "2024-09-30T20:07:23.789Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 2
          },
          {
            "_id": "66f92a02499098170001aa0e",
            "name": "ФИШ БУРГЕР",
            "category": 1,
            "description": "Наслаждайтесь фиш-бургером - хрустящим филе золотистой рыбы, покрытым свежим салатом, сливочным соусом тартар и завернутым в мягкую булочку с кунжутом. Наслаждайтесь вкусом океана!",
            "image": [
              "66f929f0499098170001aa0c"
            ],
            "price": 114,
            "_created": "2024-09-29T10:20:50.204Z",
            "_changed": "2024-09-30T20:07:27.201Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 5
          },
          {
            "_id": "66f92dee499098170001aa35",
            "name": "ШЕФБУРГЕР",
            "category": 1,
            "description": "Побалуйте себя максимальным удовольствием от «Шефбургер» — аппетитного бургера с сочной котлетой, свежими овощами и особым пикантным соусом.",
            "image": [
              "66f92de5499098170001aa33"
            ],
            "price": 185,
            "_created": "2024-09-29T10:37:34.526Z",
            "_changed": "2024-09-30T20:07:30.470Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 2
          },
          {
            "_id": "66f92ecd499098170001aa3b",
            "name": "ГАМБУРГЕР",
            "category": 1,
            "description": "Побалуйте себя максимальным удовольствием от нашей сочной говяжьей котлеты, зажатой между мягкими булочками, украшенной свежими овощами и пикантным соусом. Вкус совершенства в каждом кусочке!",
            "image": [
              "66f92ec4499098170001aa39"
            ],
            "price": 89,
            "_created": "2024-09-29T10:41:17.634Z",
            "_changed": "2024-09-30T20:07:33.444Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 2
          },
          {
            "_id": "66f92fe3499098170001aa41",
            "name": "ГОЛДЕН БУРГЕР",
            "category": 1,
            "description": "Побалуйте себя роскошью нашего Golden Burger, шедевра для гурманов, в состав которого входит говядина вагю премиум-класса, трюфельный айоли и съедобное сусальное золото. Вкус королевского вкуса с каждым кусочком.",
            "image": [
              "66f92fda499098170001aa3f"
            ],
            "price": 114,
            "_created": "2024-09-29T10:45:55.475Z",
            "_changed": "2024-09-30T20:07:36.208Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 3
          },
          {
            "_id": "66f9311e499098170001aa4b",
            "name": "ШЕФБУРГЕР ДЕ ЛЮКС",
            "category": 1,
            "description": "Побалуйте себя изысканным шефбургером де люкс — роскошным гамбургером, приготовленным из ингредиентов премиум-класса и с изысканным вкусом. Удовлетворение гарантировано!",
            "image": [
              "66f93116499098170001aa49"
            ],
            "price": 219,
            "_created": "2024-09-29T10:51:10.790Z",
            "_changed": "2024-09-30T20:07:39.151Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 1
          },
          {
            "_id": "66f93200499098170001aa51",
            "name": "БИГ БИФ",
            "category": 1,
            "description": "Побалуйте себя аппетитным бургером Big Beef с сочной говяжьей котлетой, плавленым сыром, хрустящим салатом, спелыми помидорами и пикантными солеными огурцами, заключёнными в поджаренную булочку. Удовлетворение гарантировано!",
            "image": [
              "66f931f8499098170001aa4f"
            ],
            "price": 159,
            "_created": "2024-09-29T10:54:56.516Z",
            "_changed": "2024-09-30T20:07:41.775Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 1
          },
          {
            "_id": "66f93d90499098170001aa69",
            "name": "БИГ БЛЭК БУРГЕР",
            "category": 1,
            "description": "Побалуйте себя таинственным очарованием черного бургера. Булочка на углях, пикантная говяжья котлета, плавленый сыр и фирменный соус для ярких кулинарных впечатлений.",
            "image": [
              "66f93d71499098170001aa67"
            ],
            "price": 209,
            "_created": "2024-09-29T11:44:16.327Z",
            "_changed": "2024-09-30T20:07:44.971Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 2
          },
          {
            "_id": "66f93e4f499098170001aa6e",
            "name": "ЧИКЕН КРИСПИ",
            "category": 1,
            "description": "Насладитесь непревзойденной хрустящей корочкой нашего куриного хрустящего бургера. Сделано из сочной курицы, хрустящей корочки, свежих овощей и ароматных соусов для сытного обеда.",
            "image": [
              "66f93e47499098170001aa6c"
            ],
            "price": 119,
            "_created": "2024-09-29T11:47:27.484Z",
            "_changed": "2024-09-30T20:07:47.683Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 1
          },
          {
            "_id": "66fbe96e499098170001e464",
            "name": "ИТАЛЬЯНСКАЯ",
            "description": "Настоящая итальянская пицца с тонкой корочкой, насыщенным томатным соусом, моцареллой премиум-класса и свежими начинками, такими как базилик и прошутто. Насладитесь вкусом Италии!",
            "image": [
              "66fbe95f499098170001e462"
            ],
            "price": 330,
            "category": 2,
            "_created": "2024-10-01T12:22:06.019Z",
            "_changed": "2024-10-01T12:37:47.111Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 2
          },
          {
            "_id": "66fbea37499098170001e46b",
            "name": "АССОРТИ",
            "description": "Побалуйте себя идеальным сочетанием вкусов нашей пиццы «Ассорти». Наслаждайтесь смесью начинок, которая удовлетворит любую тягу. Наслаждаться!",
            "image": [
              "66fbea2e499098170001e469"
            ],
            "price": 330,
            "category": 2,
            "_created": "2024-10-01T12:25:27.644Z",
            "_changed": "2024-10-01T12:25:27.644Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 0
          },
          {
            "_id": "66fbeaaf499098170001e470",
            "name": "МЯСНАЯ",
            "description": "Пробуждайте аппетит этой сочной мясной пиццей! Сочетание пикантного колбасного ассортимента, нежного сыра и ароматных специй идеально удовлетворит ваш вкус!",
            "image": [
              "66fbeaa6499098170001e46e"
            ],
            "price": 330,
            "category": 2,
            "_created": "2024-10-01T12:27:27.842Z",
            "_changed": "2024-10-01T12:27:27.842Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 0
          },
          {
            "_id": "66fbeca6499098170001e481",
            "name": "МАРГАРИТА",
            "description": "Наслаждайтесь классической простотой нашей пиццы «Маргарита»! Свежая моцарелла, спелые помидоры, ароматный базилик на хрустящей, запеченной в духовке корочке. Вечный итальянский фаворит.",
            "image": [
              "66fbec9d499098170001e47f"
            ],
            "price": 320,
            "category": 2,
            "_created": "2024-10-01T12:35:50.908Z",
            "_changed": "2024-10-01T12:35:50.908Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 0
          },
          {
            "_id": "66fbed8d499098170001e487",
            "name": "КУРИНАЯ",
            "description": "Насладитесь пикантной пиццей с курицей. Аппетитные куриные начинки на хрустящей корочке, дополненные смесью сыра и пикантного соуса.",
            "image": [
              "66fbed81499098170001e485"
            ],
            "price": 300,
            "category": 2,
            "_created": "2024-10-01T12:39:41.390Z",
            "_changed": "2024-10-01T12:39:41.390Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 0
          },
          {
            "_id": "66fbee1c499098170001e48b",
            "name": "ПЕППЕРОНИ",
            "description": "Порадуйте свои вкусовые рецепторы нашей пиццей Пепперони! Классический фаворит с пикантными пепперони, липким сыром и пикантным томатным соусом. Любители мяса, ликуйте!",
            "image": [
              "66fbee12499098170001e489"
            ],
            "price": 330,
            "category": 2,
            "_created": "2024-10-01T12:42:04.290Z",
            "_changed": "2024-10-01T12:42:04.290Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 0
          },
          {
            "_id": "66fbf6c2499098170001e4a8",
            "name": "ГОРЯЧИЙ ШИК",
            "description": "Эксклюзивная поднос для суши \"Горячий Шик\": изысканный дизайн, удобство и стиль в каждой детали. Подарите себе идеальное сочетание красоты и удовольствия!",
            "image": [
              "66fbf6b6499098170001e4a6"
            ],
            "price": 329,
            "category": 3,
            "_created": "2024-10-01T13:18:58.309Z",
            "_changed": "2024-10-01T13:18:58.309Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 0
          },
          {
            "_id": "66fbf740499098170001e683",
            "name": "БЕШЕНЫЙ ЛАСОСЬ",
            "description": "Изысканное блюдо суши \"Бешеный лосось\" - сочный лосось, свежий рис и тонкие водоросли, идеальное сочетание вкусов. Наслаждение для ценителей японской кухни.",
            "image": [
              "66fbf738499098170001e681"
            ],
            "price": 299,
            "category": 3,
            "_created": "2024-10-01T13:21:04.308Z",
            "_changed": "2024-10-01T13:21:04.308Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 0
          },
          {
            "_id": "66fbf7b5499098170001e689",
            "name": "СЯКЕ ТЕМПУРА",
            "description": "Побалуйте себя изысканным сочетанием хрустящих креветок темпура и свежего лосося в наших фирменных роллах Саке Темпура Суши. Наслаждайтесь идеальным сочетанием вкусов!",
            "image": [
              "66fbf7a9499098170001e687"
            ],
            "price": 329,
            "category": 3,
            "_created": "2024-10-01T13:23:01.519Z",
            "_changed": "2024-10-01T13:23:01.519Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 0
          },
          {
            "_id": "66fbfa02499098170001e690",
            "name": "КАЛИФОРНИЯ С ЛАСОСЕМ",
            "description": "Насладитесь изысканным вкусом суши \"Калифорния\" с нежным лососем. Идеальное сочетание свежих ингредиентов, приготовленное для истинных гурманов.",
            "image": [
              "66fbf9f4499098170001e68d"
            ],
            "price": 329,
            "category": 3,
            "_created": "2024-10-01T13:32:50.627Z",
            "_changed": "2024-10-01T13:32:57.625Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 1
          },
          {
            "_id": "66fbfa6b499098170001e695",
            "name": "КАЛИФОРНИЯ С КРАБОМ",
            "description": "Наслаждайтесь изысканным вкусом суши «Калифорния» с нежным крабовым мясом. Освежающий рис, авокадо, огурец и икра - идеальный выбор для гурманов.",
            "image": [
              "66fbfa62499098170001e693"
            ],
            "price": 299,
            "category": 3,
            "_created": "2024-10-01T13:34:35.048Z",
            "_changed": "2024-10-01T13:34:35.048Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 0
          },
          {
            "_id": "66fbfc73499098170001e6b7",
            "name": "ФИШ РОЛЛ",
            "description": "Побалуйте себя восхитительным сочетанием нашего рыбного рулета с шаурмой! Гармоничное сочетание ближневосточных и японских вкусов в каждом кусочке.",
            "image": [
              "66fbfc69499098170001e6b5"
            ],
            "price": 149,
            "category": 4,
            "_created": "2024-10-01T13:43:15.400Z",
            "_changed": "2024-10-01T14:38:00.462Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 1
          },
          {
            "_id": "66fbfd24499098170001e6bb",
            "name": "ЧИКЕН РОЛЛ",
            "description": "Побалуйте себя восхитительным сочетанием традиционных вкусов с современными нотками в нашем пикантном ролле с куриной шаурмой. Насладитесь смесью сочной курицы, хрустящих овощей и ароматных соусов, завернутой в мягкую теплую лепешку. Восхитительная еда, сочетающая в себе лучшее из обоих миров!",
            "image": [
              "66fbfd1b499098170001e6b9"
            ],
            "price": 149,
            "category": 4,
            "_created": "2024-10-01T13:46:12.024Z",
            "_changed": "2024-10-01T13:46:12.024Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 0
          },
          {
            "_id": "66fbfdab499098170001e6c0",
            "name": "БИФ РОЛЛ",
            "description": "Побалуйте себя соблазнительным сочетанием ближневосточной и японской кухни с нашим изысканным роллом с шаурмой из говядины. Пикантная говядина, завернутая в мягкий рулет, – изысканное наслаждение!",
            "image": [
              "66fbfd99499098170001e6be"
            ],
            "price": 149,
            "category": 4,
            "_created": "2024-10-01T13:48:27.449Z",
            "_changed": "2024-10-01T13:48:27.449Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 0
          },
          {
            "_id": "66fbfe2b499098170001e6c4",
            "name": "ЦЕЗАРЬ РОЛЛ",
            "description": "Побалуйте себя сочетанием аппетитных вкусов с нашей шаурмой «Цезарь Ролл». В мягкой тортилье нежное мясо, свежие овощи и сливочный соус «Цезарь». Приятного аппетита!",
            "image": [
              "66fbfe22499098170001e6c2"
            ],
            "price": 149,
            "category": 4,
            "_created": "2024-10-01T13:50:35.342Z",
            "_changed": "2024-10-01T13:50:35.342Z",
            "_createdby": "viskhan.rkb@gmail.com",
            "_changedby": "viskhan.rkb@gmail.com",
            "_version": 0
          }
    ];

    class MainView extends AbstractView {
        state = {
            list: [],
            loading: false,
            searchQuery: undefined,
            category_id: null,
            offset: null,
            countPage: 0,
            countElInPage: 6,
        };

        constructor(appState) {
            super();
            this.appState = appState;
            this.appState = onChange(this.appState, this.appStateHook.bind(this));
            this.state = onChange(this.state, this.stateHook.bind(this));

            this.setTitle('Меню');
            this.state.category_id = 0;
        }

        destroy() {
            onChange.unsubscribe(this.appState);
            onChange.unsubscribe(this.state);
        }

        appStateHook(path) {
            if (path === 'cart') {
                this.render();
            }
        }

        async stateHook(path) {
            if (path === 'searchQuery') {
                this.state.loading = true;
                const data = await this.loadList();
                this.state.loading = false;
                this.state.list = data.filter(food => food.name.toLowerCase().includes(this.state.searchQuery));
                this.state.countPage = Math.ceil(this.state.list.length / this.state.countElInPage);
                this.state.offset = 0; 
            }
        
            if (path === 'category_id') {
                this.state.loading = true;
                const data = await this.loadList();
                this.state.loading = false;
                this.state.offset = 0; 
                this.state.list = this.state.category_id === 0 ? data : data.filter(food => food.category === this.state.category_id);
                this.state.countPage = Math.ceil(this.state.list.length / this.state.countElInPage);
            }
        
            if (path === 'list' || path === 'loading' || path === 'offset') {
                this.state.countPage = Math.ceil(this.state.list.length / this.state.countElInPage); 
                this.render();
            }
        }
        
        async loadList() {
            return productsDB;
        }

        render() {
            const main = document.createElement('div');
            main.append(new Search(this.state).render());
            main.append(new Category(this.state).render());
            main.append(new CardList(this.appState, this.state).render());
            this.app.innerHTML = '';
            this.app.append(main);
            this.renderHeader();
        }

        renderHeader() {
            const header = new Header(this.appState).render();
            this.app.prepend(header);
        }
    }

    class CardDetails extends DivComponent {
        constructor(appState) {
            super();
            this.appState = appState;
        }

        #addToCart(product) {
            this.appState.cart.push(product);
        }

        #deleteFromCart(product) {
            this.appState.cart = this.appState.cart.filter(
                b => b._id !== product._id
            );
        }

        getProductId() {
            const params = new URLSearchParams(window.location.hash.split('?')[1]);
            return params.get('id');
        }

        getProduct() {
            const productId = this.getProductId();
            return productsDB.find(p => p._id === productId);
        }

        isInCart(id) {
            return this.appState.cart.some(prod => prod._id == id);
        }

        render() {
            const product = this.getProduct();

            if (!product) {
                return this.app.innerHTML = '<h1>Продукт не найден</h1>';
            }

            this.el.classList.add('card-details');
            this.el.innerHTML = `
            <div class="wrapper">
                <h2>${product.name}</h2>
                <div class="card__wrapper">
                    <img src="images/${product.image}.jpg" />
                    <div class="card__desc">
                        <h3>Название: ${product.name}</h3>
                        <h3>Категория: ${categoriesDB.find(cat => cat._id === product.category).name}</h3>
                        <button class="card__add" >
                            ${this.isInCart(product._id) ? "Удалить с корзины" : "Добавить в корзину"}
                        </button>
                    </div>
                </div>
                <h4> Описание: </h4>
                <h4>${product.description}</h4>
            </div>
        `;
            const button = this.el.querySelector('.card__add');

            if(this.isInCart(product._id)) {
                button.addEventListener('click', e => {
                    e.stopPropagation(); 
                    this.#deleteFromCart(product);
                });
            } else {
                button.addEventListener('click', e => {
                    e.stopPropagation(); 
                    this.#addToCart(product);
                });
            }
            return this.el;
        }
    }

    class ProductView extends AbstractView {
        constructor(appState) {
            super();
            this.appState = appState;
            this.appState = onChange(this.appState, this.appStateHook.bind(this));
            this.setTitle('О продукте');
        }

        appStateHook(path) {
            if (path === 'cart') {
                this.render();
            }
        }

        render() {
            const main = document.createElement('div');
            main.append(new CardDetails(this.appState).render());
            this.app.innerHTML = '';
            this.app.append(main);

            this.renderHeader();
        }

        renderHeader() {
            const header = new Header(this.appState).render();
            this.app.prepend(header);
        }
    }

    class App {
        routes = [
            { path: "", view: MainView },
            { path: "#cart", view: CartView },
            { path: "#product", view: ProductView },
        ];

        appState = {
            cart: [],
        };

        constructor() {
            window.addEventListener('hashchange', this.route.bind(this));
            this.route();
        }

        route() {
            if (this.currentView) {
                this.currentView.destroy();
            }
            const hashPath = location.hash.split('?')[0];
            const view = this.routes.find(r => r.path === hashPath)?.view;
            this.currentView = new view(this.appState);
            this.currentView.render();
        }
    }

    new App();

})();
