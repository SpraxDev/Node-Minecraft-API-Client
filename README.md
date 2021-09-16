# TS-Template
This is a simple template for my projects to have the same starting point on most, if not all, of my projects.


## 'Features'
* TypeScript first
* Configured for the latest Node LTS release or sometimes a newer version not being LTS (Can be easily changed
  in `packages.json` and `tsconfig.json`
* Jest for testing
* Simple example code with test coverage


## Initial setup
1. I recommend running `npm update` first (and probably `npm outdated` too)
2. Edit the initial `package.json` file to your liking
   * You probably want to pay additional attention to the `author` and `private` section of it
   * Don't forget to switch the docker container and image names used in the `docker:` scripts
3. Update the `LICENSE`-file to your liking - You don't have to comply with it, I'm just commonly using that one
4. You might want to remove the use of `snyk` - It is used as a dev dependency to easily scan for known vulnerabilities


## How to I change the Node.js version used in this template
This template used `@tsconfig/node{{nodeVersion}}` and makes use of the `engines` directive in the `package.json`. So
you'd want to change the `@tsconfig` dependency to the version you would want to use (e.g. `14` or `16`) and edit
the `tsconfig.json` file to point to that version.

You might need to make additional adjustments to my `tsconfig.json` (and `tests/tsconfig.json`) as I might be overwriting some settings that are
suboptimal for other version of node. If you are not sure, stick to the configuration provided by `@tsconfig`.

## License
This repository contains a `LICENSE`-file, but it is part of the template.
The template itself is not licensed by me! **If you use this template, just pick the license you prefer**.
