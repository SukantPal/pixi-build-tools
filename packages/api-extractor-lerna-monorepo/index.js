const fs = require('fs');
const path = require('path');
const { 
    CompilerState,
    Extractor,
    ExtractorConfig,
    ExtractorResult
} = require('@microsoft/api-extractor');
const { getPackages } = require('@lerna/project');

async function main({ tsconfigJson, showVerboseMessages } = {}) {
  const projectFolder = process.cwd();

  if (!tsconfigJson) {
    tsconfigJson = path.join(projectFolder, "./tsconfig.json");
  }
  if (!fs.existsSync(tsconfigJson)) {
    throw new Error(`${tsconfigJson} does not exist - a TypeScript configuration file is needed to use @pixi-build-tools/api-extractor-lerna-monorepo!`);
  }

  const tsconfig = require(path.relative(__dirname, tsconfigJson));

  if (!tsconfig.compilerOptions || !tsconfig.compilerOptions.outDir) {
    throw new Error(`${tsconfigJson} does not specify compilerOptions.outDir`);
  }

  // Output directory of tsc compilation
  const outDir = path.join(projectFolder, tsconfig.compilerOptions.outDir);

  // Unfiltered packages
  const projectPackages = await getPackages(projectFolder);
  const projectPackageJsons = projectPackages.map(pkg => pkg.toJSON());

  projectPackageJsons.forEach((pkgJson, i) => { pkgJson.location = projectPackages[i].location; })

  // Packages to run api-extractor on!
  const packageJsons = projectPackageJsons.filter(pkgJson => fs.existsSync(path.join(pkgJson.location, './src/index.ts')));

  let compilerState;

  packageJsons.forEach((pkg) => {
    console.log(`${pkg.name} ---------------------------------------------`)

    const location = pkg.location;
    const relative = path.relative(projectFolder, location);

    const dtsFolder = path.join(outDir, relative);
    const mainEntryPointFilePath = path.join(dtsFolder, './src/index.d.ts');

    const extractorConfig = ExtractorConfig.prepare({
        configObject: {
            mainEntryPointFilePath,
            projectFolder: pkg.location,
            bundledPackages: pkg.bundledPackages || [],
            compiler: {
                tsconfigFilePath: tsconfigJson
            },
            dtsRollup: {
                enabled: true,
                untrimmedFilePath: path.join(location, 'index.d.ts')
            },
            messages: {
                compilerMessageReporting: {
                    default: { 
                        logLevel: 'none'
                    }
                },
                extractorMessageReporting: {
                    default: {
                        logLevel: 'none'
                    }
                },
                tsdocMessageReporting: {
                    default: {
                        logLevel: 'none'
                    }
                }
            }
        },
        packageJson: pkg,
        packageFolder: pkg.location,
        packageJsonFullPath: path.join(pkg.location, './package.json')
    });

    compilerState = compilerState || CompilerState.create(extractorConfig);

    let extractorResult = {
        succeeded: false
    };

    try {
        extractorResult = Extractor.invoke(extractorConfig, {
            showVerboseMessages
        },
        compilerState);
    } catch (e) {
        console.log(`${pkg.name} failed:`);
        console.error(e);
        process.exit(1);
    }

    if (extractorResult.succeeded) {
      console.error(`${pkg.name}: completed successfully!`);
    } else {
      console.error(`${pkg.name}: completed with ${extractorResult.errorCount} errors`
         + ` and ${extractorResult.warningCount} warnings`);

      // Don't bother fellas just because of warnings :D
      if (extractorResult.errorCount > 0) {
          process.exit(1);
      }
    }
  });
}

main();

