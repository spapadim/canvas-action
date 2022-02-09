// (c) 2022- Spiros Papadimitriou <spapadim@gmail.com>
//
// This file is released under the MIT License:
//    https://opensource.org/licenses/MIT
// This software is distributed on an "AS IS" basis,
// WITHOUT WARRANTY OF ANY KIND, either express or implied.

// Rather than introduce additional dependencies, since we only need file
// uploads, this module is a simple implementation just for those endpoints.

// XXX ESLint fails with default + single/multiple imports, despite claims
//   of this being "fixed" in 2016: https://github.com/eslint/eslint/pull/5309

import * as path from 'path'

import axios, {AxiosInstance} from 'axios'
// eslint-disable-next-line sort-imports
import FormData, {AppendOptions} from 'form-data'
import {PathLike, ReadStream} from 'fs'

import {open} from 'fs/promises'
// eslint-disable-next-line sort-imports
import {URLSearchParams} from 'url'

const DEFAULT_API_BASE_URL = 'https://canvas.instructure.com'
const DEFAULT_API_PATH_PREFIX = '/api/v1'

const HTTP_STATUS_CREATED = 201 // TODO These *must* be defined in some lib..?

export class CanvasFileClient {
  private client: AxiosInstance
  private auth_headers: {Authorization: string}

  constructor(api_token: string, base_url: string = DEFAULT_API_BASE_URL) {
    this.client = axios.create({
      baseURL: `${base_url.replace(/\/+$/, '')}${DEFAULT_API_PATH_PREFIX}`
    })
    // XXX Next line works around buggy type signature of .create arg in Axios
    //   (should be AxiosDefaults, not AxiosRequestConfig) -- related to #4108 and #4140
    // XXX(2) Turns out there's another issue with TS decls; specifically, the decl
    //   type AxiosRequestHeaders = Record<string, string | number | boolean>
    //   which omits undefined in union prevents unsetting header by individual req's
    //   See also https://github.com/axios/axios/commit/0d69a79c81a475f1cca6d83d824eed1e5b0b045d#diff-833035b31e23075a88bb0eb2d52d994c40f3ef9a20e7b7afd072cccefffe10c9
    // TODO Maybe file issue on Axios GH when I have a chance... till then, eff it.
    // this.client.defaults.headers.common['Authorization'] = `Bearer ${api_token}`
    this.auth_headers = {Authorization: `Bearer ${api_token}`}
  }

  async uploadStream(
    folder_id: string,
    data: ReadStream,
    metadata?: {
      filename?: string
      length?: number
      content_type?: string
    }
  ): Promise<void> {
    // API docs: https://canvas.instructure.com/doc/api/file.file_uploads.html

    // Step 1: Ask Canvas to initiate upload
    const params = new URLSearchParams({
      parent_folder_id: folder_id,
      on_duplicate: 'overwrite'
    })
    const {filename, length, content_type} = metadata || {}
    if (filename) params.append('name', filename)
    if (length) params.append('size', length.toString())
    if (content_type) params.append('content_type', content_type)

    const response = await this.client.post(
      `/folders/${folder_id}/files`,
      params.toString(),
      {headers: this.auth_headers}
    )

    // Step 2: upload the actual file data
    const form = new FormData()
    // Copy signature given by canvas, as required by spec
    const upload_params: Record<string, string> = response.data.upload_params
    for (const [key, val] of Object.entries(upload_params)) {
      form.append(key, val)
    }
    // Add file
    const file_opts: AppendOptions = {}
    if (filename) file_opts.filename = filename
    if (length) file_opts.knownLength = length
    if (content_type) file_opts.contentType = content_type
    form.append('file', data, file_opts)

    const upload_response = await this.client.post(
      response.data.upload_url,
      form,
      {
        headers: form.getHeaders(),
        maxRedirects: 0, // We need to handle, since bearer token should be used
        validateStatus: status =>
          status === HTTP_STATUS_CREATED || (300 <= status && status < 400)
      }
    )

    // Step 3: Handle a redirect response; per spec, *must* use GET (regardless of status code?)
    if (upload_response.status !== HTTP_STATUS_CREATED) {
      await this.client.get(upload_response.headers.Location, {
        headers: this.auth_headers,
        decompress: false // TODO Better to entirely skip reading body (we're not gonna use anyway)
      })
    }
  }

  async uploadFile(folder_id: string, pathname: PathLike): Promise<void> {
    const fh = await open(pathname, 'r')
    return await this.uploadStream(folder_id, fh.createReadStream(), {
      filename: path.basename(pathname.toString()),
      length: (await fh.stat()).size
    })
  }
}
