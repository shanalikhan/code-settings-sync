import { dest as $dest, src as $src, watch as $watch } from "gulp";
import * as concat from "gulp-concat";
import * as ts from "gulp-typescript";
import * as uglify from "gulp-uglify";

const project = ts.createProject("tsconfig.json");

export const watch = cb => {
  $watch(["src/**/*.ts"], compile);
  cb();
};

export const compile = cb => {
  $src(["src/**/*.ts"])
    .pipe(project())
    .pipe(concat("extension.js"))
    .pipe(uglify())
    .pipe($dest("out"));
  cb();
};
