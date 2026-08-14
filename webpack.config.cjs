const path = require("path");
const ModuleFederationPlugin = require("webpack/lib/container/ModuleFederationPlugin");

module.exports = {
  mode: "production",
  entry: {},
  experiments: { outputModule: true },
  output: {
    path: path.resolve(__dirname, "dist/public"),
    module: true,
    clean: false,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  plugins: [
    new ModuleFederationPlugin({
      name: "signalk_mcp_container",
      library: { type: "module" },
      filename: "remoteEntry.js",
      exposes: {
        "./PluginConfigurationPanel": "./src/configpanel/PluginConfigurationPanel",
      },
      shared: {
        react: { singleton: true, requiredVersion: "^19" },
      },
    }),
  ],
};
