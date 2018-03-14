function newNuntiusConnection() {
    var wsConn = new WSConnection('ws://127.0.0.1:4445/')
    let nuntiusConn = {}
    let vars = {
        ready: false,
        readyfns: [],
        authed: false,
        incConnFns: [],
        acceptingConn: undefined,
        isStreaming: false,
        readyToStream: false,
        acceptReturned: false,
        pendingConn: {},
        publicid: undefined
    }

    class IncomingConnection {
        constructor(remoteid, connid, parentconnapi) {
            this.remoteid = remoteid
            this.connid = connid
            this.parentconnapi = parentconnapi
            this._handled = false
        }
        
        isHandled() {
            return this._handled
        }

        accept() {
            let self = this;
            return new Promise(function(resolve, reject) {
                if (self._handled) {
                    reject('connection already handled')
                    return
                }

                self._handled = true
                self._resolve = resolve
                self._reject = reject

                let newConn = newNuntiusConnection()
                newConn.onReady(function() {
                    newConn._acceptConnection(self)
                })
            })
        }

        reject() {
            if (this._handled) {
                reject('connection already handled')
                return
            }
            return this.parentconnapi.RejectConnection(this.connid)
        }
    }

    class RemoteConnection {
        constructor(conn, remoteid) {
            this.conn = conn
            this.remoteid = remoteid
        }
        
        getRemoteID() {
            return this.remoteid
        }
    }

    let myFuncs = {
        'IncomingConnection': function(connid, pendingid, remoteid) {
            autorpc.verifyArgs(arguments, 'bytearray', 'int', 'bytearray')

            let incConn = new IncomingConnection(remoteid, connid, this)

            if (remoteid == vars.publicid) {
                let pendingConn = vars.pendingConn[pendingid]
                if (pendingConn !== undefined) {
                    delete vars.pendingConn[pendingid]
                    incConn.remoteid = pendingConn.publicid
                    incConn.accept().then(pendingConn.resolve, pendingConn.reject)
                } else {
                    incConn.reject()
                }
            }

            for(let fn of vars.incConnFns) {
                fn(incConn)
            }

            if (!incConn.isHandled()) {
                incConn.reject()
            }
        },
        'InitializeConnection': function(connid) {
            autorpc.verifyArgs(arguments, 'bytearray')
            if (connid == vars.acceptingConn.connid) {
                if (vars.acceptReturned) {
                    vars.isStreaming = true
                    _startStreaming(this, wsConn, vars.acceptingConn)
                }
                vars.readyToStream = true
            }
        },
        'ErrorConnection': function(connid, err) {
            autorpc.verifyArgs(arguments, 'bytearray', 'string')
            if (connid == vars.acceptingConn.connid) {
                vars.acceptingConn._reject(err)
            }
        },
    }

    let service = autorpc.useConnection(wsConn, {
        'Version':          ['byte'],
        'Register':         ['bytearray', 'bytearray', 'bytearray'],
        'Authenticate':     ['bytearray', 'bytearray', 'bytearray'],
        'ConnectTo':        ['bytearray', 'int'],
        'RejectConnection': ['bytearray'],
        'AcceptConnection': ['bytearray'],
    }, myFuncs);

    wsConn.onOpen(function() {
        service.Version(10).then(function() {
            vars.ready = true
            for (let fn of vars.readyfns) {
                fn()
            }
        })
    })

    function _startStreaming(service, conn, acceptingConn) {
        service.detach()
        acceptingConn._resolve(new RemoteConnection(conn, acceptingConn.remoteid))
    }

    nuntiusConn._acceptConnection = function(conn) {
        if (vars.authed) {
            conn._reject('connection already authed')
            return
        }

        if (vars.acceptingConn !== undefined) {
            conn._reject('connection already handled')
            return
        }
        
        vars.acceptingConn = conn
        service.AcceptConnection(conn.connid).then(function() {
            vars.acceptReturned = true
            if (vars.readyToStream) {
                vars.isStreaming = true
                _startStreaming(service, wsConn, vars.acceptingConn)
            }
        })
    }

    nuntiusConn.onReady = function(fn) {
        vars.readyfns.push(fn)

        if (vars.ready) {
            fn()
        }
    }

    nuntiusConn.onIncomingConnection = function(fn) {
        vars.incConnFns.push(fn)
    }

    nuntiusConn.register = function(appid, publicid, registrationkey) {
        if (!vars.ready) {
            return new Promise(function (resolve, reject) {
                reject('connection isn\'t ready')
            })
        }

        return new Promise(function(resolve, reject) {
            service.Register(appid, publicid, registrationkey).then(function(value) {
                vars.authed = true
                vars.publicid = publicid
                resolve(value)
            }).catch(reject)
        })
    }
    
    nuntiusConn.auth = function(appid, publicid, secreykey) {
        if (!vars.ready) {
            return new Promise(function (resolve, reject) {
                reject('connection isn\'t ready')
            })
        }

        return new Promise(function(resolve, reject) {
            service.Authenticate(appid, publicid, secreykey).then(function(value) {
                vars.authed = true
                vars.publicid = publicid
                resolve(value)
            }).catch(reject)
        })
    }

    nuntiusConn.connectTo = function(publicid) {
        if (!vars.authed) {
            return new Promise(function (resolve, reject) {
                reject('connection isn\'t not authenticated')
            })
        }

        return new Promise(function(resolve, reject) {
            var randomId
            do {
                randomId = (1 + Math.random() * 10000000) | 0;
            } while (vars.pendingConn[randomId] != undefined)
            vars.pendingConn[randomId] = {resolve, reject, publicid}

            service.ConnectTo(publicid, randomId).catch(function(err) {
                delete vars.pendingConn[randomId]
                reject(err)
            })
        })
    }

    return nuntiusConn
}