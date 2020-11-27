let ejs = require("ejs");
let path = require("path");
let fs = require("fs");
let parser = require("@babel/parser");
let t = require("@babel/types");
let traverse = require("@babel/traverse").default;
let generator = require("@babel/generator").default;

// babylon-->@babel/parser 源码转换为ast
// @babel/traverse 遍历
// @babel/types 转换
// @babel/generator 生成
class Compiler {
  constructor(config) {
    this.config = config;
    /**
     * 1.保存入口文件路径
     * 2.保存所有的模块依赖
     */
    // 1.保存入口文件路径
    this.entryId; //"./src/index.js"
    //  2.保存所有的模块依赖
    this.modules = {};

    // 入口路径
    this.entry = config.entry;
    // 工作目录
    this.root = process.cwd(); //运行工作的路径
  }
  // 解析源码
  parse(source, parentPath) {
    // ast 解析语法树
    let ast = parser.parse(source);
    let dependencies = [];
    traverse(ast, {
      CallExpression(p) {
        // 调用表达式 a() require()
        let node = p.node;
        // 加下判断
        if (node.callee.name === "require") {
          // 名字改造
          node.callee.name = "__webpack_require__";
          // 引用路径改造
          let moduleName = node.arguments[0].value; // 模块的引用名字
          moduleName = moduleName + (path.extname(moduleName) ? "" : ".js"); //后缀
          // 加上parentPath
          moduleName = "./" + path.join(parentPath, moduleName);
          ("./src/a.js");
          dependencies.push(moduleName);
          node.arguments = [t.stringLiteral(moduleName)];
        }
      },
    });
    let sourceCode = generator(ast).code;
    return { sourceCode, dependencies };
  }
  getSource(modulePath) {
    // 处理loader
    /**
     * 1.拿到规则
     */
    let rules = this.config.module.rules;
    let content = fs.readFileSync(modulePath, "utf8");
    // /拿到每个规则来处理
    for (let i = 0; i < rules.length; i++) {
      let rule = rules[i];
      let { use, test } = rule;
      let len = use.length - 1;
      if (test.test(modulePath)) {
        function normalLoader() {
          // 这个模块需要通过loader来转换
          // loader的路径
          let loader = require(use[len--]); //通过路径获取函数
          // 递归调用loader 实现转换功能
          content = loader(content);
          if (len >= 0) {
            // 递归调用
            normalLoader();
          }
        }
        normalLoader();
      }
    }

    return content;
  }
  // 构建模块
  buildModule(modulePath, isEntry) {
    /* 拿到模块内容 */
    let source = this.getSource(modulePath);
    // 模块id  总路径减去工作路径 =>相对路径
    let moduleName = "./" + path.relative(this.root, modulePath);
    // 如果是主入口
    if (isEntry) {
      // 保存入口的名字
      this.entryId = moduleName;
    }

    // './a.js' --> './src/a.js'
    // 修改require
    // 源码改造 添加src 引用路径也要改掉
    // 返回一个依赖列表
    let { sourceCode, dependencies } = this.parse(
      source,
      path.dirname(moduleName)
    ); // 源码 父路径  ./src
    // 把相对路径和模块中得内容对应起来
    this.modules[moduleName] = sourceCode;
    dependencies.forEach((dep) => {
      this.buildModule(path.join(this.root, dep), false);
    });
  }
  emitFile() {
    // 模板数据替换
    // 发射文件
    let outputPath = path.join(
      this.config.output.path,
      this.config.output.filename
    );
    // 获取模板地址
    let templateStr = this.getSource(path.resolve(__dirname, "main.ejs"));
    // ejs render
    let code = ejs.render(templateStr, {
      modules: this.modules,
      entryId: this.entryId,
    });
    // 输出
    this.asssets = {};
    this.asssets[outputPath] = code;
    fs.writeFileSync(outputPath, code);
  }

  run() {
    // 执行并且创建模块的依赖关系
    this.buildModule(path.resolve(this.root, this.entry), true);
    console.log("this.modules: ", this.modules, this.entryId);

    // 发射一个文件 打包后的文件
    this.emitFile();
  }
}
module.exports = Compiler;
