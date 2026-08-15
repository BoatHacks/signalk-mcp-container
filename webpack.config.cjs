const path = require("path");
const ModuleFederationPlugin = require("webpack/lib/container/ModuleFederationPlugin");

module.exports = {
  mode: "production",
  entry: {},
  experiments: { outputModule: true },
  output: {
    // signalk-server only serves a plugin's Module Federation config-panel
    // bundle if it finds a "public/" directory directly under the package
    // root (interfaces/webapps.js's mountWebModules: `fs.existsSync(
    // webappPath + '/public/')`) — "dist/public" here previously landed in
    // the wrong place, so the server silently fell back to the plain
    // JSON-schema form instead of loading this panel.
    path: path.resolve(__dirname, "public"),
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
