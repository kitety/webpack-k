#! /usr/bin/env node

// console.log("start");
/**
 * 1.拿到当前执行的路径，拿到配置文件
 */

let path = require("path");
let Compiler = require("../lib/Compiler.js");
let config = require(path.resolve("webpack.config.js"));

let compiler = new Compiler(config);
compiler.hooks.entryOption.call();
// 标识运行编译
compiler.run();
