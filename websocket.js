class WSConnection {
    constructor(url, options) {
        this.url = url
        this.options = options || {}
        if (this.options.autoReconnect === undefined)
            this.options.autoReconnect = true
        this.isOpen = false

        this.openFn = this._ensureFnArray(this.options.onOpen)
        this.closeFn = this._ensureFnArray(this.options.onClose)
        this.errorFn = this._ensureFnArray(this.options.onError)
        this.messageFn = this._ensureFnArray(this.options.onMessage)

        this._connect()
    }

    _connect() {
        let self = this;
        this.ws = new WebSocket(this.url, this.options.protocols)
        this.ws.onopen = function(event) {
            self.isOpen = true
            self._callHandlers(self.openFn).call(self, event)
        } 

        this.ws.onclose = function(event) {
            self.isOpen = false
            self._callHandlers(self.closeFn).call(self, event)
            if (self.options.autoReconnect)
                setTimeout(function() { self._connect() }, 1000)
        }
        this.ws.onerror = this._callHandlers(this.errorFn)
        this.ws.onmessage = this._callHandlers(this.messageFn)
    }

    _ensureFnArray(fnArr) {
        var res = []
        
        if (typeof fnArr === 'function') {
            res.push(fnArr)
            return res;
        }

        if (typeof fnArr !== 'array') {
            return res
        }

        for (var i = 0; i < fnArr.length; ++i) {
            var fn = fnArr[i]
            if (typeof fn === 'function')
                res.push(fn)
        }

        return res;
    }

    _callHandlers(fns) {
        let self = this;
        return function(event) {
            for (var i = 0; i < fns.length; ++i)
                fns[i].call(self, event)
        }
    }

    send(data) {
        var self = this;
        if (!this.isOpen) {
            setTimeout(function() { self.send(data) }, 100);
            return
        }

        if (typeof data === 'object')
            data = JSON.stringify(data)
        this.ws.send(data)
    }

    _addHandler(arr, fn) {
        arr.push(fn)
        return function() {
            let i = arr.indexOf(fn)
            if (i != -1)
                arr.splice(i, 1)
        }
    }

    onOpen(fn) { return this._addHandler(this.openFn, fn) }
    onClose(fn) { return this._addHandler(this.closeFn, fn) }
    onError(fn) { return this._addHandler(this.errorFn, fn) }
    onMessage(fn) { return this._addHandler(this.messageFn, fn) }
}
