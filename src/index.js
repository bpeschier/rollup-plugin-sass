import { dirname, relative } from 'path';
import { writeFileSync, readFileSync } from 'fs';
import { renderSync } from 'node-sass'
import { isString, isFunction } from 'util'
import { createFilter } from 'rollup-pluginutils'
import { insertStyle } from './style.js'
import { ensureFileSync } from 'fs-extra'

export default function plugin(options = {}) {
    const filter = createFilter(options.include || [ '**/*.sass', '**/*.scss' ], options.exclude || 'node_modules/**');
    const insertFnName = '___$insertStyle';
    const styles = [];
    const deps = {};
    const depInitial = [];
    let dest = '';

  options.output = options.output || false
  options.insert = options.insert || false
  options.processor = options.processor || null
  options.options = options.options || null

  return {
    name: 'sass',

    intro () {
      if (options.insert) {
        return insertStyle.toString().replace(/insertStyle/, insertFnName)
      }
    },

    options (opts) {
      dest = opts.dest || opts.entry
    },

        async transform(code, id) {
            var isDep = deps.hasOwnProperty(id);
            var initial = isDep && depInitial.indexOf(id) === -1;

            if (initial) {
                // TODO: rollup directly pushes the imports, so we will just return
                depInitial.push(id);
                return {
                    code: "",
                    map: { mappings: ""}
                }
            }

            if (!filter(id)) {
                return null;
            }

            if (isDep) {
                code = readFileSync(deps[id]).toString();
                id = deps[id];
            }

            const paths = [dirname(id), process.cwd()];
            const sassConfig = Object.assign({ data: code }, options.options);

      sassConfig.includePaths = sassConfig.includePaths
            ? sassConfig.includePaths.concat(paths)
            : paths

            try {
                let result = renderSync(sassConfig);
                let css = result.css.toString();
                let code = '';
                let imports = (isDep ? "" : result.stats.includedFiles
                        .map(function(file) {
                            return "import \"./" + relative(paths[0], file) + "\";";
                        })
                        .join("\n"));


                result.stats.includedFiles.forEach((f) => {
                    deps[f] = id;
                });

        if (css.trim()) {
          if (isFunction(options.processor)) {
            css = await options.processor(css, id)
          }
          if (styleMaps[id]) {
            styleMaps[id].content = css
          } else {
            styles.push(styleMaps[id] = {
              id: id,
              content: css
            })
          }
          css = JSON.stringify(css)

          if (options.insert === true) {
            code = `${insertFnName}(${css});`
          } else if (options.output === false) {
            code = css
          } else {
            code = `"";`
          }
        }

                return {
                    code: (imports.length ? imports + "\n" : "") + `export default ${code};`,
                    map: { mappings: '' }
                };
            } catch (error) {
                throw error;
            }
        },

    async ongenerate (opts, result) {
      if (!options.insert && (!styles.length || options.output === false)) {
        return
      }

      const css = styles.map((style) => {
        return style.content
      }).join('')

      // Reset styles for next generation
      styles.length = 0;

      if (isString(options.output)) {
        ensureFileSync(options.output, (err) => {
          if (err) throw err
        })
        return writeFileSync(options.output, css)
      } else if (isFunction(options.output)) {
        return options.output(css, styles)
      } else if (!options.insert && dest) {
        if (dest.endsWith('.js')) {
          dest = dest.slice(0, -3)
        }
        dest = `${dest}.css`
        ensureFileSync(dest, (err) => {
          if (err) throw err
        })
        return writeFileSync(dest, css)
      }
    }
  }
}
