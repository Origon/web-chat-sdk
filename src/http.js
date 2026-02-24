/**
 * API Service for Chat SDK
 * Handles all HTTP requests without depending on external state
 */

import { getCredentials, getExternalId, getConfigData } from './chat.js'
import { MESSAGE_ROLES } from './constants.js'

const AUTHENTICATION_ERROR = 'Something went wrong initializing the chat'
const INITIALIZATION_ERROR = 'Chat SDK not initialized'

/**
 * Authenticate with the chat service
 * @param {{ endpoint: string }} credentials
 * @returns {Promise<object>} Authentication response data
 */
export async function authenticate(payload) {
  const { endpoint } = payload
  const url = `${endpoint}/config`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    const errorPayload = await response.json()
    throw new Error(errorPayload?.error || AUTHENTICATION_ERROR)
  }

  const res = await response.json()
  const data = res.data

  return data
}

/**
 * Get chat history for the current device
 * @returns {Promise<{ sessions: Array }>}
 */
export async function getHistory() {
  const queryParams = new URLSearchParams({
    externalId: getExternalId()
  })
  const response = await fetchRequest(`/sessions?${queryParams.toString()}`, 'GET')

  if (!response.ok) {
    throw new Error('Unable to load history, please try again later')
  }

  return response.json()
}

/**
 * Get session data (control and history) for a specific session
 * @param {string} sessionId
 * @returns {Promise<{ control: string, messages: Array }>}
 */
export async function getSession(sessionId) {
  const queryParams = new URLSearchParams({
    sessionId
  })
  const response = await fetchRequest(`/session?${queryParams.toString()}`, 'GET')

  if (!response.ok) {
    throw new Error('Unable to load messages, please try again later')
  }

  const data = await response.json()
  const control = data?.control
  const messages = (data?.history ?? []).map((msg) => ({
    id: msg.id,
    text: msg.text,
    role: msg.youtubeVideo
      ? MESSAGE_ROLES.ASSISTANT // for youtube video messages, role is "system" from backend, we need to make it "assistant"
      : msg.role,
    timestamp: msg.timestamp,
    video: msg.youtubeVideo,
    attachments: msg.attachments,
    channel: msg.channel,
    done: true
  }))

  return { control, messages }
}

/**
 * Validate a file against attachment config rules
 * @param {File} file
 * @returns {string|null} Error message if validation fails, null if valid
 */
function validateAttachment(file) {
  const configData = getConfigData()
  const attachmentsConfig = configData?.attachments

  if (!attachmentsConfig) {
    return 'Attachments are not enabled'
  }

  const fileName = file.name || ''
  const fileExtension = fileName.split('.').pop()?.toLowerCase()

  if (!fileExtension) {
    return 'File type is not supported'
  }

  // Find the category that supports this file extension
  const categories = ['images', 'documents', 'audio', 'videos']
  let matchedCategory = null
  let matchedConfig = null

  for (const category of categories) {
    const categoryConfig = attachmentsConfig[category]
    if (categoryConfig?.supportedFileTypes?.includes(fileExtension)) {
      matchedCategory = category
      matchedConfig = categoryConfig
      break
    }
  }

  if (!matchedCategory) {
    return `File type ".${fileExtension}" is not supported`
  }

  if (!matchedConfig.enabled) {
    return `${matchedCategory.charAt(0).toUpperCase() + matchedCategory.slice(1)} attachments are not supported`
  }

  // maxSize is in MB
  const fileSizeMB = file.size / (1024 * 1024)
  if (matchedConfig.maxSize && fileSizeMB > matchedConfig.maxSize) {
    return `${fileName} size exceeds the maximum allowed size of ${matchedConfig.maxSize}MB`
  }

  return null
}

/**
 * Upload attachment with progress tracking
 * @param {File} file
 * @param {Function} onProgress - callback (percentComplete, loaded, total)
 * @param {Function} onComplete - callback (error, response)
 * @returns {XMLHttpRequest} xhr object to allow abort
 */
export function uploadAttachment(file, onProgress, onComplete) {
  const credentials = getCredentials()
  const { endpoint, token } = credentials || {}

  if (!endpoint) {
    const error = new Error(INITIALIZATION_ERROR)
    if (onComplete) {
      onComplete(error, null)
    }
    return null
  }

  // Validate attachment against config (skip if authenticated via token)
  if (!token) {
    const validationError = validateAttachment(file)
    if (validationError) {
      if (onComplete) {
        onComplete(new Error(validationError), null)
      }
      return null
    }
  }

  const xhr = new XMLHttpRequest()
  const formData = new FormData()
  formData.append('file', file)

  const uploadUrl = `${endpoint}/upload`

  xhr.open('POST', uploadUrl)
  if (token) {
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
  }

  // Upload progress callback
  if (onProgress) {
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const percentComplete = (event.loaded / event.total) * 100
        onProgress(percentComplete, event.loaded, event.total)
      }
    })
  }

  // Upload complete callback
  xhr.addEventListener('load', () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        const response = JSON.parse(xhr.responseText)
        if (onComplete) {
          onComplete(null, response)
        }
      } catch (error) {
        if (onComplete) {
          onComplete(new Error('Failed to parse response'), null)
        }
      }
    } else {
      if (onComplete) {
        onComplete(new Error(`Upload failed with status ${xhr.status}`), null)
      }
    }
  })

  xhr.addEventListener('error', () => {
    if (onComplete) {
      onComplete(new Error('Network error during upload'), null)
    }
  })

  xhr.addEventListener('abort', () => {
    if (onComplete) {
      onComplete(new Error('Upload aborted'), null)
    }
  })

  xhr.send(formData)

  return xhr
}

/**
 * Delete attachment by mediaId
 * @param {string} mediaId
 * @returns {Promise<{ success: boolean }>}
 */
export async function deleteAttachment(mediaId) {
  const credentials = getCredentials()
  const { endpoint, token } = credentials || {}

  if (!endpoint) {
    throw new Error(INITIALIZATION_ERROR)
  }

  const deleteUrl = `${endpoint}/delete/${mediaId}`

  const headers = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(deleteUrl, {
    method: 'DELETE',
    headers
  })

  if (!response.ok) {
    throw new Error(`Delete failed with status ${response.status}`)
  }

  return { success: true }
}

/**
 * Get attachment URL by mediaId
 * @param {string} mediaId
 * @returns {string} Full URL to the attachment
 */
export function getAttachment(mediaId) {
  const credentials = getCredentials()
  const { endpoint } = credentials || {}

  if (!endpoint) {
    throw new Error(INITIALIZATION_ERROR)
  }

  return `${endpoint}/upload/${mediaId}`
}

/**
 * Internal fetch request helper
 * @param {string} pathname
 * @param {string} method
 * @param {object|null} body
 * @returns {Promise<Response>}
 */
async function fetchRequest(pathname, method = 'GET', body = null) {
  const credentials = getCredentials()

  const { endpoint, token } = credentials || {}
  if (!endpoint) {
    throw new Error(INITIALIZATION_ERROR)
  }

  const baseUrl = new URL(endpoint)
  const [path, queryString] = pathname.split('?')
  baseUrl.pathname = baseUrl.pathname.replace(/\/$/, '') + path
  if (queryString) {
    new URLSearchParams(queryString).forEach((value, key) => {
      baseUrl.searchParams.append(key, value)
    })
  }
  const url = baseUrl.toString()

  const headers = {
    'Content-Type': 'application/json'
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  return fetch(url, {
    headers,
    method,
    body: body ? JSON.stringify(body) : null
  })
}
