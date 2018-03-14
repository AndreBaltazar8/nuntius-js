let autorpc = {
    typeInt: function(obj) {
        return Number.isInteger(obj)
    },
    typeByte: function(obj) {
        return Number.isInteger(obj) && obj >= 0 || obj <= 255
    },
    typeByteArray: function(obj) {
        if (!Array.isArray(obj)) {
            if (typeof obj !== 'string')
                return false
            try {
                window.atob(obj)
                return true
            } catch(e) {
                return false
            }
        }
        for (let i = 0; i < obj.length; ++i) {
            let val = obj[i]
            if (!Number.isInteger(val) || val < 0 || val > 255)
                return false
        }
        return true
    },
    checkType: function(provided, expected, obj) {
        if (typeof expected == 'function')
            return expected(obj)
        if (expected == 'int' && autorpc.typeInt(obj))
            return true
        if (expected == 'byte' && autorpc.typeByte(obj))
            return true
        if (expected == 'bytearray' && autorpc.typeByteArray(obj))
            return true
        return provided === expected
    },
    verifyArgs: function(args, ...types) {
        if (args.length != types.length) {
            throw 'Arguments length does not match, expected ' + types.length + ' but got ' + args.length
        }
        
        for (let i = 0; i < args.length; ++i) {
            let type = typeof args[i]
            if (!autorpc.checkType(type, types[i], args[i])) {
                let typeExpected = (typeof types[i] == 'function' ? types[i].name : types[i])
                throw fnName + ' argument ' + i + ' expected ' + typeExpected + ' but got ' + type
            }
        }
    },
    useConnection: function(connection, serverAPI, thisAPI) {
        let callPool = {}
        let service = {}

        let isWSConnection = WSConnection !== undefined && connection.constructor == WSConnection.prototype.constructor

        function processMessage(msg) {
            let self = this
            let reader = new FileReader()
            reader.addEventListener("loadend", function() {
                let data = JSON.parse(reader.result)
                if (data.f === undefined) { // call return
                    let callPromise = callPool[data.c]
                    if (data.e !== undefined) {
                        callPromise[1](data.e)
                    } else {
                        callPromise[0](data.d)
                    }
                    callPool[data.c] = undefined
                } else {
                    let fn = thisAPI[data.f]
                    if (fn == undefined) {
                        self.send(JSON.stringify({e: 'autorpc: function not found', c: data.c}))
                        console.log('remote tried to call unknown function: ' + data.f)
                        return
                    }

                    if (Array.isArray(data.a)) {
                        let result = fn.apply(service, data.a)
                        if (result === undefined) {
                            self.send(JSON.stringify({c: data.c}))
                        } else if (Array.isArray(result)) {
                            self.send(JSON.stringify({d: result, c: data.c}))
                        } else {
                            self.send(JSON.stringify({e: result, c: data.c}))
                        }
                    }
                }
            })
            reader.readAsText(msg.data)
        }

        if (isWSConnection)
            service.detach = connection.onMessage(processMessage)
        else
            connection.onmessage = processMessage
        if (service.detach === undefined) {
            service.detach = function() {
                connection.onmessage = undefined
            }
        }
    
        let apiFns = Object.keys(serverAPI)
    
        function waitCall(resolve, reject) {
            var randomId
            do {
                randomId = '' + ((1 + Math.random() * 10000000) | 0);
            } while (callPool[randomId] != undefined)
            callPool[randomId] = [resolve, reject]
            return randomId
        }
    
        function createFn(fnName, args) {
            return function() {
                if (arguments.length != args.length) {
                    throw fnName + ' needs ' + args.length + ' args, ' + arguments.length + ' was provided'
                }
    
                var argsArr = []
                for (let i = 0; i < arguments.length; ++i) {
                    let type = typeof arguments[i]
                    if (!autorpc.checkType(type, args[i], arguments[i])) {
                        let typeExpected = (typeof args[i] == 'function' ? args[i].name : args[i])
                        throw fnName + ' argument ' + i + ' expected ' + typeExpected + ' but ' + type + ' was provided'
                    }
                    argsArr.push(arguments[i])
                }
                
                return new Promise(function(resolve, reject) {
                    let callid = waitCall(resolve, reject)
                    connection.send(JSON.stringify({f: fnName, a: argsArr, c: callid}))
                })
            }
        }
    
        for (let i = 0; i < apiFns.length; ++i) {
            let fnName = apiFns[i]
            service[fnName] = createFn(fnName, serverAPI[fnName])
        }
    
        return service
    }
}
