// (c) 2022- Spiros Papadimitriou <spapadim@gmail.com>
//
// This file is released under the MIT License:
//    https://opensource.org/licenses/MIT
// This software is distributed on an "AS IS" basis,
// WITHOUT WARRANTY OF ANY KIND, either express or implied.

import * as core from '@actions/core'
import * as glob from '@actions/glob'
import {CanvasFileClient} from './canvas'

async function run(): Promise<void> {
  let uploadCount = 0 // Files successfully uploaded
  let excludeCount = 0 // Files skipped based on exclude globs
  let errorCount = 0 // Individual file upload failures
  let failed = false // Whether *overall* job failed

  try {
    const apiBaseUrl: string = core.getInput('api_base_url', {required: true})
    const apiToken: string = core.getInput('api_token', {required: true})
    const folderId: string = core.getInput('folder_id', {required: true})
    // eslint-disable-next-line prettier/prettier
    const filenames: string[] = core.getMultilineInput('files', {required: true})
    const exclude: string[] = core.getMultilineInput('exclude')

    const client = new CanvasFileClient(apiToken, apiBaseUrl)

    const excludeSet: Set<string> = await (async () => {
      if (exclude) {
        const excludeGlob = await glob.create(exclude.join('\n'))
        return new Set(await excludeGlob.glob())
      } else {
        return new Set<string>()
      }
    })()

    core.info(`Running on Node ${process.version}`)

    const fileGlob = await glob.create(filenames.join('\n'))
    for await (const file of fileGlob.globGenerator()) {
      if (excludeSet.has(file)) {
        core.info(`Skipping ${file}`)
        ++excludeCount
        continue
      }
      core.info(`Uploading ${file}`)
      try {
        await client.uploadFile(folderId, file)
      } catch (error) {
        if (error instanceof Error) {
          core.warning(`Failed to upload ${file}: ${error.message}`, {file})
          ++errorCount
        }
      }
      ++uploadCount
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Fatal exception:\n${error.stack}`)
      failed = true
    }
  }

  // If upload attemps were made but none successful, this should still be considered an overall failure
  if (uploadCount === 0 && errorCount > 0) {
    core.setFailed('All file uploads failed')
    failed = true
  }

  const statsMsg = `${uploadCount} uploaded, ${excludeCount} skipped, ${errorCount} failed`
  if (failed) {
    core.error(`Action unsucessful: ${statsMsg}`)
    if (uploadCount > 0)
      core.warning('Some files were uploaded; please delete manually if needed')
  } else {
    core.notice(`Action successful: ${statsMsg}`)
  }
}

run()
