const path = require('path');
const fs = require('fs');
const ejs = require('ejs');
let parser = require("@babel/parser");
const t = require('@babel/types');
const generate = require('@babel/generator').default;
const traverse = require('@babel/traverse').default;
let mainTemplate = fs.readFileSync(path.join(__dirname, 'main.ejs'), 'utf8');
let chunkTemplate = fs.readFileSync(path.join(__dirname, 'chunk.ejs'), 'utf8');
class Compiler {
  constructor(config) {
    this.config = config;
  }
  run () {
    let { entry } = this.config;
    this.entry = entry;
    this.chunks = {
      main: {}
    };
    this.buildModule(entry, 'main');
    this.emitFiles();
  }
  buildModule (moduleId, chunkId) {
    const originalSource = fs.readFileSync(moduleId, 'utf8');
    const ast = parser.parse(originalSource, {
      plugins: ['dynamicImport']
    });
    let dependencies = [];
    traverse(ast, {
      CallExpression: (nodePath) => {
        if (nodePath.node.callee.name == 'require') {
          let node = nodePath.node;
          node.callee.name = '__webpack_require__';
          let moduleName = node.arguments[0].value;
          let dependencyModuleId = "./" + path.posix.join(path.posix.dirname(moduleId), moduleName);
          dependencies.push(dependencyModuleId);
          node.arguments = [t.stringLiteral(dependencyModuleId)];
        } else if (t.isImport(nodePath.node.callee)) {
          let node = nodePath.node;
          let moduleName = node.arguments[0].value;
          let dependencyModuleId = "./" + path.posix.join(path.posix.dirname(moduleId), moduleName);
          let dependencyChunkId = dependencyModuleId.slice(2).replace(/(\/|\.)/g, '_') + '.js';
          nodePath.replaceWithSourceString(`__webpack_require__.e("${dependencyChunkId}").then(__webpack_require__.t.bind(__webpack_require__,"${dependencyModuleId}"))`);
          this.buildModule(dependencyModuleId, dependencyChunkId);
        }
      }
    });
    let { code } = generate(ast);
    (this.chunks[chunkId] = this.chunks[chunkId] || {})[moduleId] = code;
    dependencies.forEach(dependencyModuleId => this.buildModule(dependencyModuleId, chunkId));
  }
  emitFiles () {
    let { output } = this.config;
    let chunks = Object.keys(this.chunks).forEach(chunkId => {
      if (chunkId === 'main') {
        let outputFile = path.posix.join(output.path, output.filename);
        let mainContent = ejs.compile(mainTemplate)({ entry: this.entry, modules: this.chunks[chunkId] });
        fs.writeFileSync(outputFile, mainContent);
      } else {
        let chunkContent = ejs.compile(chunkTemplate)({ chunkId, modules: this.chunks[chunkId] });
        let outputFile = path.join(output.path, chunkId);
        fs.writeFileSync(outputFile, chunkContent);
      }
    });
  }
}
module.exports = Compiler
