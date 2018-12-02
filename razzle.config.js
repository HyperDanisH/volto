const path = require('path');
const autoprefixer = require('autoprefixer');
const makeLoaderFinder = require('razzle-dev-utils/makeLoaderFinder');
const nodeExternals = require('webpack-node-externals');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const fs = require('fs');
const { fromPairs, map, mapValues } = require('lodash');
const glob = require('glob').sync;

const fileLoaderFinder = makeLoaderFinder('file-loader');
const eslintLoaderFinder = makeLoaderFinder('eslint-loader');

const projectRootPath = path.resolve('.');

const packageJson = require(path.join(projectRootPath, 'package.json'));

module.exports = {
  modify: (config, { target, dev }, webpack) => {
    const BASE_CSS_LOADER = {
      loader: 'css-loader',
      options: {
        importLoaders: 2,
        sourceMap: true,
        localIdentName: '[name]__[local]___[hash:base64:5]',
      },
    };

    const POST_CSS_LOADER = {
      loader: require.resolve('postcss-loader'),
      options: {
        // Necessary for external CSS imports to work
        // https://github.com/facebookincubator/create-react-app/issues/2677
        ident: 'postcss',
        plugins: () => [
          require('postcss-flexbugs-fixes'),
          autoprefixer({
            browsers: [
              '>1%',
              'last 4 versions',
              'Firefox ESR',
              'not ie < 9', // React doesn't support IE8 anyway
            ],
            flexbox: 'no-2009',
          }),
        ],
      },
    };

    const LESSLOADER = {
      test: /\.less$/,
      include: [path.resolve('./theme'), /node_modules\/semantic-ui-less/],
      use: dev
        ? [
            {
              loader: 'style-loader',
            },
            BASE_CSS_LOADER,
            POST_CSS_LOADER,
            {
              loader: 'less-loader',
              options: {
                outputStyle: 'expanded',
                sourceMap: true,
              },
            },
          ]
        : [
            MiniCssExtractPlugin.loader,
            {
              loader: 'css-loader',
              options: {
                importLoaders: 2,
                sourceMap: true,
                modules: false,
                minimize: true,
                localIdentName: '[name]__[local]___[hash:base64:5]',
              },
            },
            POST_CSS_LOADER,
            {
              loader: 'less-loader',
              options: {
                outputStyle: 'expanded',
                sourceMap: true,
              },
            },
          ],
    };

    const SVGLOADER = {
      test: /icons\/.*\.svg$/,
      use: [
        {
          loader: 'svg-loader',
        },
        {
          loader: 'svgo-loader',
          options: {
            plugins: [
              { removeTitle: true },
              { convertPathData: false },
              { removeUselessStrokeAndFill: true },
              { removeViewBox: false },
            ],
          },
        },
      ],
    };

    if (target === 'web') {
      config.plugins.unshift(
        new webpack.DefinePlugin({
          __CLIENT__: true,
          __SERVER__: false,
        }),
      );
    }

    if (target === 'node') {
      config.plugins.unshift(
        new webpack.DefinePlugin({
          __CLIENT__: false,
          __SERVER__: true,
        }),
      );
    }

    config.module.rules.push(LESSLOADER);
    config.module.rules.push(SVGLOADER);

    // Don't load config|variables|overrides) files with file-loader
    // Don't load SVGs from ./src/icons with file-loader
    const fileLoader = config.module.rules.find(fileLoaderFinder);
    fileLoader.exclude = [
      /\.(config|variables|overrides)$/,
      /icons\/.*\.svg$/,
      ...fileLoader.exclude,
    ];

    // Disabling the ESlint pre loader
    config.module.rules.splice(0, 1);

    const customizations = {};
    map(
      glob('src/customizations/**/*.*(svg|png|jpg|jpeg|gif|ico|less|js|jsx)'),
      filename => {
        const target = filename.replace('src/', `${projectRootPath}/src/`);
        if (
          fs.existsSync(
            `node_modules/@plone/volto/${filename.replace(
              'customizations/',
              '',
            )}`,
          )
        ) {
          customizations[
            filename
              .replace('src/customizations/', '@plone/volto/')
              .replace(/\.(js|jsx)$/, '')
          ] = target;
        } else {
          console.log(
            `The file ${filename} doesn't exist in the volto package (${target}), unable to customize.`,
          );
        }
      },
    );

    config.resolve.alias = {
      ...customizations,
      ...config.resolve.alias,
      '../../theme.config$': `${projectRootPath}/theme/theme.config`,
      '@plone/volto':
        packageJson.name === '@plone/volto'
          ? `${projectRootPath}/src/`
          : `${projectRootPath}/node_modules/@plone/volto/src/`,
    };

    config.performance = {
      maxAssetSize: 10000000,
      maxEntrypointSize: 10000000,
    };

    const babelRuleIndex = config.module.rules.findIndex(
      rule =>
        rule.use &&
        rule.use[0].loader &&
        rule.use[0].loader.includes('babel-loader'),
    );
    const { include } = config.module.rules[babelRuleIndex];
    if (fs.existsSync('./node_modules/@plone/volto/src')) {
      include.push(fs.realpathSync('./node_modules/@plone/volto/src'));
    }
    var exclude = [];
    exclude.push(fs.realpathSync('./src/elm'));
    config.module.rules[babelRuleIndex] = Object.assign(
      config.module.rules[babelRuleIndex],
      {
        include,
        exclude,
      },
    );
    config.externals =
      target === 'node'
        ? [
            nodeExternals({
              whitelist: [
                dev ? 'webpack/hot/poll?300' : null,
                /\.(eot|woff|woff2|ttf|otf)$/,
                /\.(svg|png|jpg|jpeg|gif|ico)$/,
                /\.(mp4|mp3|ogg|swf|webp)$/,
                /\.(css|scss|sass|sss|less)$/,
                /^@plone\/volto/,
              ].filter(Boolean),
            }),
          ]
        : [];

    return config;
  },
};
