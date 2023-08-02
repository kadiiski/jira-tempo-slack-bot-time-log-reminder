const debug = (...data) => {
  if(process.env.DEBUG === 'true') console.debug(...data)
}

module.exports = {debug}
