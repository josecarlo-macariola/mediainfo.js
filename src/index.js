import MediaInfo from '../build/mediainfo.js'

const mediaInfoLib = MediaInfo()

const createMI = (mi, { chunkSize, format }) => {
  const analyzeData = (getSize, readChunk, cb) => {
    if (cb === undefined) {
      return new Promise((resolve) =>
        analyzeData(getSize, readChunk, (result) => resolve(result))
      )
    }

    const fileSizeValue = getSize()
    let offset = 0

    const runReadDataLoop = (fileSize) => {
      const getChunk = () => {
        const readNextChunk = (data) => {
          if (continueBuffer(data)) {
            getChunk()
          } else {
            finalize()
          }
        }
        const dataValue = readChunk(
          Math.min(chunkSize, fileSize - offset),
          offset
        )
        if (dataValue instanceof Promise) {
          dataValue.then(readNextChunk)
        } else {
          readNextChunk(dataValue)
        }
      }

      const continueBuffer = (data) => {
        if (data.length === 0 || openBufferContinue(data, data.length)) {
          return false
        }
        const seekTo = openBufferContinueGotoGet()
        if (seekTo === -1) {
          offset += data.length
        } else {
          offset = seekTo
          openBufferInit(fileSize, seekTo)
        }
        return true
      }

      const finalize = () => {
        openBufferFinalize()
        const result = inform()
        cb(format === 'object' ? JSON.parse(result) : result)
      }

      openBufferInit(fileSize, offset)
      getChunk()
    }

    if (fileSizeValue instanceof Promise) {
      fileSizeValue.then(runReadDataLoop)
    } else {
      runReadDataLoop(fileSizeValue)
    }
  }

  const close = () => mi.close()

  const inform = () => mi.inform()

  const openBufferContinue = (data, size) =>
    mi.open_buffer_continue(data, size) & 0x02 // bit 0 set -> done

  const openBufferContinueGotoGet = () => {
    // JS bindings don' support 64 bit int
    // https://github.com/buzz/mediainfo.js/issues/11
    let seekTo = -1
    const seekToLow = mi.open_buffer_continue_goto_get_lower()
    const seekToHigh = mi.open_buffer_continue_goto_get_upper()
    if (seekToLow == -1 && seekToHigh == -1) {
      seekTo = -1
    } else if (seekToLow < 0) {
      seekTo = seekToLow + 4294967296 + seekToHigh * 4294967296
    } else {
      seekTo = seekToLow + seekToHigh * 4294967296
    }
    return seekTo
  }

  const openBufferFinalize = () => mi.open_buffer_finalize()

  const openBufferInit = (size, offset) => mi.open_buffer_init(size, offset)

  return {
    analyzeData,
    chunkSize,
    close,
    inform,
    openBufferContinue,
    openBufferContinueGotoGet,
    openBufferFinalize,
    openBufferInit,
  }
}

const mediaInfoFactory = (userOptions = {}, cb) => {
  if (cb === undefined) {
    return new Promise((resolve) =>
      mediaInfoFactory(userOptions, (mediainfo) => resolve(mediainfo))
    )
  }

  const defaultOptions = { chunkSize: 1024 * 1024, format: 'object' }
  const opts = { ...defaultOptions, ...userOptions }

  mediaInfoLib.then((MI) => {
    const format = opts.format === 'object' ? 'JSON' : opts.format
    const mi = createMI(new MI.MediaInfo(format), opts)
    cb(mi)
  })
}

export default mediaInfoFactory
