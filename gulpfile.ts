import {
  dest as $dest,
  series as $series,
  src as $src,
  watch as $watch
} from "gulp";
import * as sourcemaps from "gulp-sourcemaps";
import * as ts from "gulp-typescript";
import * as uglify from "gulp-uglify";

const project = ts.createProject("tsconfig.json");

export const watch = cb => {
  $watch(["src/**/*.ts"], compile);
  cb();
};

export const compile = cb => {
  $src(["src/**/*.ts"])
    .pipe(sourcemaps.init())
    .pipe(project())
    .pipe(uglify())
    .pipe(sourcemaps.write("../out"))
    .pipe($dest("out"));
  cb();
};

export const watchdev = $series(compile, watch);
