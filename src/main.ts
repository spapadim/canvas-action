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
  try {
    const apiBaseUrl: string = core.getInput('api_base_url', {required: true})
    const apiToken: string = core.getInput('api_token', {required: true})
    const folderId: string = core.getInput('folder_id', {required: true})
    // eslint-disable-next-line prettier/prettier
    const filenames: string[] = core.getMultilineInput('filenames', {required: true})
    const exclude: string[] = core.getMultilineInput('exclude_filenames')

    const client = new CanvasFileClient(apiToken, apiBaseUrl)

    const excludeSet: Set<string> = await (async () => {
      if (exclude) {
        const excludeGlob = await glob.create(exclude.join('\n'))
        return new Set(await excludeGlob.glob())
      } else {
        return new Set<string>()
      }
    })()

    const fileGlob = await glob.create(filenames.join('\n'))
    for await (const file of fileGlob.globGenerator()) {
      if (excludeSet.has(file)) continue
      core.info(`Uploading ${file}`)
      try {
        await client.uploadFile(folderId, file)
      } catch (error) {
        if (error instanceof Error)
          core.error(`Failed to upload ${file}: ${error.message}`)
      }
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
