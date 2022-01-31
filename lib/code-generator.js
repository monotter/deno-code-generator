export const CodeGenerator = (function () {
  "use strict";

  const codeGenerator = function () {
  };

  /**
   * @type {{
   *  alphanumericChars: string,
   *  numericChars: string,
   *  alphanumericRegex: RegExp,
   *  numericRegex: RegExp,
   *  alphanumericMoreRegex: RegExp,
   *  numericMoreRegex: RegExp,
   *  sparsity: number,
   *  existingCodesLoader: Function
   * }}
   */
  const defaultOptions = {
    alphanumericChars: '123456789ABCDEFGHJKLMNPQRSTUVWXYZ',
    numericChars: '0123456789',
    alphanumericRegex: /\*(?!\+)/g,
    numericRegex: /#(?!\+)/g,
    alphanumericMoreRegex: /\*\+/g,
    numericMoreRegex: /#\+/g,
    sparsity: 1,
    existingCodesLoader: function () {
      return [];
    }
  };

  codeGenerator.prototype = {

    /**
     * Generates howMany codes following a pattern.
     * In the pattern, the following characters are replaced:
     * # -> with a single numeric character
     * * -> with a single alphanumeric character (excluding ambiguous letters and numbers)
     * #+ -> with more numeric characters (the number of characters depends on howMany codes we need to generate)
     * *+ -> with more alphanumeric characters (idem)
     *
     * @param {string} pattern
     * @param {number} [howMany]
     * @param {Object} [options]
     * @param {string} [options.alphanumericChars]
     * @param {string} [options.numericChars]
     * @param {RegExp} [options.alphanumericRegex]
     * @param {RegExp} [options.numericRegex]
     * @param {RegExp} [options.alphanumericMoreRegex]
     * @param {RegExp} [options.numericMoreRegex]
     * @param {number} [options.sparsity]
     * @param {Function} [options.existingCodesLoader]
     * @throws {Error}
     * @returns {Array}
     */
    generateCodes: function (pattern, howMany, options) {
      options = mergeOptions(defaultOptions, options);
      if (options.sparsity < 1) options.sparsity = 1;
      howMany = howMany || 1;
      const howManySparse = Math.ceil(howMany * options.sparsity);

      const repetitions = [];
      const existingCodes = loadExistingCodes(pattern, options);
      const existingCount = Object.keys(existingCodes).length;
      const existingCountSparse = Math.ceil(existingCount * options.sparsity);

      if (hasMorePlaceholder(pattern, options)) {
        repetitions = calculateRepetitions(pattern, howManySparse, existingCountSparse, options);
      } else {
        checkRequestedCode(pattern, options, existingCountSparse, howManySparse, howMany, existingCount)
      }

      const combinedRegexp = combineRegexps([
        options.alphanumericMoreRegex,
        options.numericMoreRegex,
        options.alphanumericRegex,
        options.numericRegex
      ], 'g');

      const generated = [];

      while (generated.length < howMany) {
        const rep = repetitions.slice();
        const code = pattern.replace(combinedRegexp, ( function (_match, alphanumericMore, numericMore, alphanumeric, numeric) {
          switch (true) {
            case (alphanumericMore !== undefined):
              return this.randomChars(options.alphanumericChars, rep.shift());
            case (numericMore !== undefined):
              return this.randomChars(options.numericChars, rep.shift());
            case (alphanumeric !== undefined):
              return this.randomChars(options.alphanumericChars, 1);
            case (numeric) !== undefined:
              return this.randomChars(options.numericChars, 1);
          }
        }).bind(this));

        // deno-lint-ignore no-prototype-builtins
        if (!existingCodes.hasOwnProperty(code)) {
          generated.push(code);
          existingCodes[code] = true;
        }
      }

      return generated;
    },

    /**
     * Generates a random string of length howMany given a list of allowed characters
     *
     * @param {string} allowedChars
     * @param {number} howMany
     * @returns {string}
     */
    randomChars: function (allowedChars, howMany) {
      let text = '';
      for (let i = 0; i < howMany; i++) {
        text += allowedChars.charAt(Math.floor(Math.random() * allowedChars.length));
      }
      return text;
    }
  };

  function loadExistingCodes (pattern, options) {
    let existingCodes = [];
    if (typeof options.existingCodesLoader === 'function') {
      existingCodes = options.existingCodesLoader(pattern);
    }
    return convertToObject(existingCodes);
  }

  /**
   * Converts an array of strings to an object so that all the elements of the array are keys of the object
   *
   * @param ary
   * @returns {{}}
   */
  function convertToObject (ary) {
    const obj = {};
    ary.forEach( function(el) {
      obj[el] = true;
    });
    return obj;
  }

  /**
   * Throws an error if the requested codes are more than the available ones given the fixed part of the pattern
   *
   * @param {string} pattern
   * @param {Object} options
   * @param {number} existingCountSparse
   * @param {number} howManySparse
   * @param {number} howMany
   * @param {number} existingCount
   * @throws {Error}
   */
  function checkRequestedCode (pattern, options, existingCountSparse, howManySparse, howMany, existingCount) {
    const possible = countNonRepeatingPermutations(pattern, options);
    const available = possible - existingCountSparse;
    if (available < howManySparse) {
      throw new Error(
        'Cannot generate ' + howMany +
        ' codes. Maximum: ' + Math.round(possible / options.sparsity) +
        ', existing: ' + existingCount +
        ', sparsity: ' + options.sparsity
      );
    }
  }

  /**
   * @param {string} pattern
   * @param {number} howMany
   * @param {number} existing
   * @param {Object} options
   * @returns {Array}
   */
  function calculateRepetitions (pattern, howMany, existing, options) {
    const nonRepeatingPermutations = countNonRepeatingPermutations(pattern, options);
    const alphanumericMatches = pattern.match(options.alphanumericMoreRegex);
    const numericMatches = pattern.match(options.numericMoreRegex);
    howMany = Math.max(1, howMany - nonRepeatingPermutations + existing);

    const totalMatches = (alphanumericMatches ? alphanumericMatches.length : 0) +
      (numericMatches ? numericMatches.length : 0);
    const distribute = Math.ceil(howMany / totalMatches);
    const combined = combineRegexps([options.alphanumericMoreRegex, options.numericMoreRegex], 'g');
    const repetitions = [];
    pattern.replace(combined, (function (_match, alphanum, numeric) {
      switch (true) {
        case (alphanum !== undefined):
          repetitions.push(neededChars(distribute, options.alphanumericChars));
          break;
        case (numeric) !== undefined:
          repetitions.push(neededChars(distribute, options.numericChars));
          break;
      }
    }).bind(this));
    return repetitions;
  }

  /**
   * Returns the possible permutations given a pattern relative to the non-repeating part
   *
   * @param {string} pattern
   * @param {Object} options
   * @returns {number}
   */
  function countNonRepeatingPermutations (pattern, options) {
    const numericPermutations = countPermutations(pattern, options.numericRegex, options.numericChars);
    const alphanumericPermutations = countPermutations(pattern, options.alphanumericRegex, options.alphanumericChars);
    if (numericPermutations > 0 && alphanumericPermutations > 0) {
      return numericPermutations * alphanumericPermutations;
    }
    return numericPermutations + alphanumericPermutations;
  }

  function countPermutations (pattern, matcher, chars) {
    const matches = pattern.match(matcher);
    return matches ? Math.pow(chars.length, matches.length) : 0;
  }

  /**
   * Counts the number of characters needed to generate a certain number of permutations
   * with a given list of allowed characters.
   *
   * @param {number} howMany
   * @param {string} allowedChars
   * @returns {number}
   */
  function neededChars (howMany, allowedChars) {
    return Math.ceil(Math.log(howMany) / Math.log(allowedChars.length));
  }

  /**
   * @param {Array} regexps
   * @param {string} flags
   * @returns {RegExp}
   */
  function combineRegexps (regexps, flags) {
    const combined = [];
    regexps.forEach(function (regexp) {
      combined.push('(' + regexp.source + ')');
    });
    return new RegExp(combined.join('|'), flags);
  }

  /**
   * Whether the pattern contains the alphanumericMore (*+) or the numericMore (#+) placeholders.
   *
   * @param {string} pattern
   * @param {Object} options
   * @returns {boolean}
   */
  function hasMorePlaceholder (pattern, options) {
    return options.alphanumericMoreRegex.test(pattern) || options.numericMoreRegex.test(pattern);
  }

  /**
   * Merges two objects and returns a new object
   *
   * @param {Object} defaultOptions
   * @param {Object} options
   * @returns {Object}
   */
  function mergeOptions (defaultOptions, options) {
    const result = {};
    const opts = options || {};
    for (const i in defaultOptions) {
      // deno-lint-ignore no-prototype-builtins
      if (defaultOptions.hasOwnProperty(i)) {
        // deno-lint-ignore no-prototype-builtins
        result[i] = (opts.hasOwnProperty(i)) ? opts[i] : defaultOptions[i];
      }
    }
    return result;
  }

  return codeGenerator;

})()