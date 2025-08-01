const {ipcMain} = require("electron")
const DNS = require("dns")

/**@deprecated */
// module.exports = (win, originGetClient) => {
module.exports = (win, getClient) => {
    let stream
    let currentPort
    let currentHost
    let currentDownstreamProxy
    // 用于恢复正在劫持的 MITM 状态
    ipcMain.handle("mitm-have-current-stream", (e) => {
        return {
            haveStream: !!stream,
            host: currentHost,
            port: currentPort,
            downstreamProxy: currentDownstreamProxy
        }
    })

    // 发送恢复会话信息，让服务器把上下文发回来
    ipcMain.handle("mitm-recover", (e) => {
        if (stream) {
            stream.write({
                recover: true
            })
        }
    })

    // 发送恢复会话信息，让服务器把上下文发回来
    ipcMain.handle("mitm-reset-filter", (e) => {
        if (stream) {
            stream.write({
                setResetFilter: true
            })
        }
    })

    ipcMain.handle("mitm-auto-forward", (e, value) => {
        if (stream) {
            stream.write({setAutoForward: true, autoForwardValue: value})
        }
    })

    // 丢掉该消息
    ipcMain.handle("mitm-drop-request", (e, id) => {
        if (stream) {
            stream.write({
                id,
                drop: true
            })
        }
    })

    // 丢掉该响应
    ipcMain.handle("mitm-drop-response", (e, id) => {
        if (stream) {
            stream.write({
                responseId: id,
                drop: true
            })
        }
    })
    // 原封不动转发
    ipcMain.handle("mitm-forward-response", (e, id) => {
        if (stream) {
            stream.write({
                responseId: id,
                forward: true
            })
        }
    })
    // 原封不动转发请求
    ipcMain.handle("mitm-forward-request", (e, id) => {
        if (stream) {
            stream.write({
                id: id,
                forward: true
            })
        }
    })

    // 发送劫持请当前请求的消息，可以劫持当前响应的请求
    ipcMain.handle("mitm-hijacked-current-response", (e, id, should) => {
        if (stream) {
            if (should) {
                stream.write({
                    id: id,
                    hijackResponse: true
                })
            } else {
                stream.write({
                    id: id,
                    cancelhijackResponse: true
                })
            }
        }
    })
    ipcMain.handle("mitm-enable-plugin-mode", (e, initPluginNames) => {
        if (stream) {
            stream.write({
                setPluginMode: true,
                initPluginNames
            })
        }
    })

    // MITM 转发
    ipcMain.handle("mitm-forward-modified-request", (e, params) => {
        if (stream) {
            const {request, id, tags, autoForwardValue} = params
            stream.write({
                id,
                request: Buffer.from(request),
                Tags: tags,
                setAutoForward: true,
                autoForwardValue: autoForwardValue
            })
        }
    })
    // MITM 转发 - HTTP 响应
    ipcMain.handle("mitm-forward-modified-response", (e, params) => {
        if (stream) {
            const {response, responseId} = params
            stream.write({
                responseId: responseId,
                response: response
            })
        }
    })

    // MITM 启用插件
    ipcMain.handle("mitm-exec-script-content", (e, content) => {
        if (stream) {
            stream.write({
                setYakScript: true,
                yakScriptContent: content
            })
        }
    })

    // MITM 启用插件，通过插件 ID
    ipcMain.handle("mitm-exec-script-by-id", (e, data) => {
        if (stream) {
            const {id, params} = data
            stream.write({
                setYakScript: true,
                yakScriptID: `${id}`,
                yakScriptParams: params
            })
        }
    })

    // MITM 获取当前已经启用的插件
    ipcMain.handle("mitm-get-current-hook", (e, data) => {
        if (stream) {
            stream.write({
                getCurrentHook: true
            })
        }
    })

    // MITM 移除插件
    ipcMain.handle("mitm-remove-hook", (e, params) => {
        if (stream) {
            stream.write({
                removeHook: true,
                removeHookParams: params
            })
        }
    })

    // 设置过滤器
    ipcMain.handle("mitm-filter", (e, filter) => {
        if (stream) {
            stream.write(filter)
        }
    })

    // 设置正则替换
    ipcMain.handle("mitm-content-replacers", (e, replacers) => {
        if (stream) {
            stream.write({replacers, setContentReplacers: true})
        }
    })

    // 清除 mitm 插件缓存
    ipcMain.handle("mitm-clear-plugin-cache", () => {
        if (stream) {
            stream.write({
                setClearMITMPluginContext: true
            })
        }
    })

    // 过滤 ws
    ipcMain.handle("mitm-filter-websocket", (e, filterWebsocket) => {
        if (stream) {
            stream.write({
                filterWebsocket,
                updateFilterWebsocket: true
            })
        }
    })

    // 下游代理
    ipcMain.handle("mitm-set-downstream-proxy", (e, downstreamProxy) => {
        if (stream) {
            stream.write({
                SetDownstreamProxy: true,
                downstreamProxy
            })
        }
    })

    // host port
    ipcMain.handle("mitm-host-port", (e, data) => {
        if (stream) {
            const {host, port} = data
            stream.write({
                host,
                port
            })
        }
    })

    // 开始调用 MITM，设置 stream
    let isFirstData = true
    ipcMain.handle("mitm-start-call", (e, params) => {
        const {host, port, downstreamProxy, enableHttp2, ForceDisableKeepAlive, certificates, extra} = params
        if (stream) {
            if (win) {
                win.webContents.send("client-mitm-start-success")
            }
            return
        }

        isFirstData = true
        stream = getClient().MITM()
        // 设置服务器发回的消息的回调函数
        stream.on("data", (data) => {
            // 处理第一个消息
            // 第一个消息应该更新状态，第一个消息应该是同步 Filter 的信息。。。
            if (win && isFirstData) {
                isFirstData = false
                win.webContents.send("client-mitm-start-success")
            }

            // mitm 服务端控制客户端加载状态
            if (win && data["haveLoadingSetter"]) {
                win.webContents.send("client-mitm-loading", !!data["loadingFlag"])
            }

            // mitm 服务端给客户端发送提示信息
            if (win && data["haveNotification"]) {
                win.webContents.send("client-mitm-notification", data["notificationContent"])
            }

            // 检查替代规则的问题，如果返回了有内容，说明没 BUG
            if (win && (data?.replacers || []).length > 0) {
                win.webContents.send("client-mitm-content-replacer-update", data.replacers)
            }

            // 如果是强制更新的话，一般通过这里触发
            if (win && data?.justContentReplacer) {
                win.webContents.send("client-mitm-content-replacer-update", data.replacers)
            }

            // 检查如果是 exec result 的话，对应字段应该是
            if (win && data["haveMessage"]) {
                win.webContents.send("client-mitm-message", data["message"])
                return
            }

            // 看看当前系统的 hooks 有哪些
            if (win && data["getCurrentHook"]) {
                win.webContents.send("client-mitm-hooks", data["hooks"])
                return
            }

            // 把劫持到的信息发送回前端
            if (win) {
                if (data.justFilter) {
                    win.webContents.send("client-mitm-filter", data.FilterData)
                    return
                }
                if (data.id == "0" && data.responseId == "0") return
                win.webContents.send("client-mitm-hijacked", {...data})
            }
        })
        stream.on("error", (err) => {
            stream = null
            if (err.code && win) {
                switch (err.code) {
                    case 1:
                        win.webContents.send("client-mitm-error", "")
                        return
                    default:
                        win.webContents.send("client-mitm-error", err.details || `${err}`)
                        return
                }
            }
        })
        stream.on("end", () => {
            if (stream) {
                stream.cancel()
            }
            stream = undefined
        })
        currentHost = host
        currentPort = port
        currentDownstreamProxy = downstreamProxy
        if (stream) {
            const value = {
                host,
                port,
                downstreamProxy,
                enableHttp2,
                ForceDisableKeepAlive,
                certificates,
                ...extra,
                DisableCACertPage: extra.disableCACertPage,
                DisableWebsocketCompression: !extra.DisableWebsocketCompression
            }
            stream.write(value)
        }
    })
    ipcMain.handle("mitm-stop-call", () => {
        if (stream) {
            stream.cancel()
            stream = null
            mitmClient = null
        }
    })

    // const asyncFetchHostIp = (params) => {
    //     return new Promise((resolve, reject) => {
    //         DNS.lookup(params, function (err, address) {
    //             if (err) {
    //                 reject(err)
    //                 return
    //             }
    //             resolve(address)
    //         });
    //     })
    // }
    // 获取URL的IP地址
    // ipcMain.handle("fetch-url-ip", async (e, params) => {
    //     return await asyncFetchHostIp(params)
    // })

    // 劫持前重置过滤器
    const asyncResetMITMFilter = (params) => {
        return new Promise((resolve, reject) => {
            getClient().ResetMITMFilter(params, (err, data) => {
                if (err) {
                    reject(err)
                    return
                }
                resolve(data)
            })
        })
    }
    ipcMain.handle("ResetMITMFilter", async (e, params) => {
        return await asyncResetMITMFilter(params)
    })

    // asyncDownloadMITMCert wrapper
    const asyncDownloadMITMCert = (params) => {
        return new Promise((resolve, reject) => {
            getClient().DownloadMITMCert(params, (err, data) => {
                if (err) {
                    reject(err)
                    return
                }
                resolve(data)
            })
        })
    }
    ipcMain.handle("DownloadMITMCert", async (e, params) => {
        return await asyncDownloadMITMCert(params)
    })

    // asyncExportMITMReplacerRules wrapper
    const asyncExportMITMReplacerRules = (params) => {
        return new Promise((resolve, reject) => {
            getClient().ExportMITMReplacerRules(params, (err, data) => {
                if (err) {
                    reject(err)
                    return
                }
                resolve(data)
            })
        })
    }
    ipcMain.handle("ExportMITMReplacerRules", async (e, params) => {
        return await asyncExportMITMReplacerRules(params)
    })

    // asyncImportMITMReplacerRules wrapper
    const asyncImportMITMReplacerRules = (params) => {
        return new Promise((resolve, reject) => {
            getClient().ImportMITMReplacerRules(params, (err, data) => {
                if (err) {
                    reject(err)
                    return
                }
                resolve(data)
            })
        })
    }
    ipcMain.handle("ImportMITMReplacerRules", async (e, params) => {
        return await asyncImportMITMReplacerRules(params)
    })

    // asyncGetCurrentRules wrapper
    const asyncGetCurrentRules = (params) => {
        return new Promise((resolve, reject) => {
            getClient().GetCurrentRules(params, (err, data) => {
                if (err) {
                    reject(err)
                    return
                }
                resolve(data)
            })
        })
    }
    ipcMain.handle("GetCurrentRules", async (e, params) => {
        return await asyncGetCurrentRules(params)
    })

    const asyncQueryMITMReplacerRules = (params) => {
        return new Promise((resolve, reject) => {
            getClient().QueryMITMReplacerRules(params, (err, data) => {
                if (err) {
                    reject(err)
                    return
                }
                resolve(data)
            })
        })
    }
    ipcMain.handle("QueryMITMReplacerRules", async (e, params) => {
        return await asyncQueryMITMReplacerRules(params)
    })

    // asyncSetCurrentRules wrapper
    const asyncSetCurrentRules = (params) => {
        return new Promise((resolve, reject) => {
            getClient().SetCurrentRules(params, (err, data) => {
                if (err) {
                    reject(err)
                    return
                }
                resolve(data)
            })
        })
    }
    ipcMain.handle("SetCurrentRules", async (e, params) => {
        return await asyncSetCurrentRules(params)
    })

    // 设置mitm filter
    const asyncSetMITMFilter = (params) => {
        return new Promise((resolve, reject) => {
            getClient().SetMITMFilter(params, (err, data) => {
                if (err) {
                    reject(err)
                    return
                }

                resolve(data)
            })
        })
    }

    ipcMain.handle("mitm-set-filter", async (e, params) => {
        if (stream) {
            stream.write({...params, updateFilter: true})
        }
        return await asyncSetMITMFilter(params)
    })
    // 获取mitm filter
    const asyncGetMITMFilter = (params) => {
        return new Promise((resolve, reject) => {
            getClient().GetMITMFilter(params, (err, data) => {
                if (err) {
                    reject(err)
                    return
                }

                resolve(data)
            })
        })
    }
    ipcMain.handle("mitm-get-filter", async (e, params) => {
        return await asyncGetMITMFilter(params)
    })

    // 设置mitm Hijack filter
    const asyncSetMITMHijackFilter = (params) => {
        return new Promise((resolve, reject) => {
            getClient().SetMITMHijackFilter(params, (err, data) => {
                if (err) {
                    reject(err)
                    return
                }

                resolve(data)
            })
        })
    }
    ipcMain.handle("mitm-hijack-set-filter", async (e, params) => {
        if (stream) {
            stream.write({HijackFilterData: params.FilterData, updateHijackFilter: true})
        }
        return await asyncSetMITMHijackFilter(params)
    })
    // 获取mitm Hijack filter
    const asyncGetMITMHijackFilter = (params) => {
        return new Promise((resolve, reject) => {
            getClient().GetMITMHijackFilter(params, (err, data) => {
                if (err) {
                    reject(err)
                    return
                }

                resolve(data)
            })
        })
    }
    ipcMain.handle("mitm-hijack-get-filter", async (e, params) => {
        return await asyncGetMITMHijackFilter(params)
    })

    // 代理劫持
    const asyncGenerateURL = (params) => {
        return new Promise((resolve, reject) => {
            getClient().GenerateURL(params, (err, data) => {
                if (err) {
                    reject(err)
                    return
                }

                resolve(data)
            })
        })
    }
    ipcMain.handle("mitm-agent-hijacking-config", async (e, params) => {
        return await asyncGenerateURL(params)
    })
}
