import React, {memo, useEffect, useRef, useState} from "react"
import {useMemoizedFn} from "ahooks"
import {PluginSourceType, PluginToDetailInfo} from "../type"
import {HubListRecycle} from "./HubListRecycle"
import {HubListOwn} from "./HubListOwn"
import {HubListLocal} from "./HubListLocal"
import {Tooltip} from "antd"
import {HubSideBarList} from "../defaultConstant"
import {HubListOnline} from "./HubListOnline"

import classNames from "classnames"
import styles from "./PluginHubList.module.scss"
import {PageNodeItemProps, usePageInfo} from "@/store/pageInfo"
import {shallow} from "zustand/shallow"
import {YakitRoute} from "@/enums/yakitRoute"
import {defaultPluginHubPageInfo} from "@/defaultConstants/PluginHubPage"
import emiter from "@/utils/eventBus/eventBus"

interface PluginHubListProps {
    /** 根元素的id */
    rootElementId?: string
    isDetail: boolean
    /** 进入指定插件的详情页 */
    toPluginDetail: (info: PluginToDetailInfo) => void
    /** 是否隐藏详情页面 */
    setHiddenDetailPage: (v: boolean) => any
}
/** @name 插件中心 */
export const PluginHubList: React.FC<PluginHubListProps> = memo((props) => {
    const {rootElementId, isDetail, toPluginDetail, setHiddenDetailPage} = props
    const {queryPagesDataById} = usePageInfo(
        (s) => ({
            queryPagesDataById: s.queryPagesDataById
        }),
        shallow
    )
    const initPageInfo = useMemoizedFn(() => {
        const currentItem: PageNodeItemProps | undefined = queryPagesDataById(
            YakitRoute.Plugin_Hub,
            YakitRoute.Plugin_Hub
        )
        if (currentItem && currentItem.pageParamsInfo.pluginHubPageInfo) {
            return currentItem.pageParamsInfo.pluginHubPageInfo
        } else {
            return {...defaultPluginHubPageInfo}
        }
    })

    /** ---------- Tabs组件逻辑 Start ---------- */
    // 控制各个列表的初始渲染变量，存在列表对应类型，则代表列表UI已经被渲染
    const rendered = useRef<Set<string>>(new Set([initPageInfo().tabActive || "online"]))

    const [active, setActive] = useState<PluginSourceType>(initPageInfo().tabActive || "online")

    useEffect(() => {
        const refreshPluginHubTabActive = (tabActive: PluginSourceType) => {
            onSetActive(tabActive)
        }
        emiter.on("refreshPluginHubTabActive", refreshPluginHubTabActive)
        return () => {
            emiter.off("refreshPluginHubTabActive", refreshPluginHubTabActive)
        }
    }, [])

    const [activeHidden, setActiveHidden] = useState<boolean>(false)
    const onSetActive = useMemoizedFn((type: PluginSourceType) => {
        setHintShow((val) => {
            for (let key of Object.keys(val)) {
                if (type === "recycle") val[key] = false
                else if (key === type) val[key] = true
                else val[key] = false
            }
            return {...val}
        })
        if (type === active) {
            if (active === "recycle") return
            isDetail ? setHiddenDetail((val) => !val) : setActiveHidden((val) => !val)
        } else {
            if (!rendered.current.has(type)) {
                rendered.current.add(type)
            }
            setHiddenDetailPage(type === "recycle")
            setActive(type)
        }
    })

    const [hintShow, setHintShow] = useState<Record<string, boolean>>({})
    /** ---------- Tabs组件逻辑 End ---------- */

    /** ---------- 进入插件详情逻辑 Start ---------- */
    const [hiddenDetail, setHiddenDetail] = useState<boolean>(false)
    const onClickPlugin = useMemoizedFn((info: PluginToDetailInfo) => {
        if (!isDetail) {
            setHiddenDetail(false)
        }
        toPluginDetail(info)
    })
    /** ---------- 进入插件详情逻辑 End ---------- */

    const barHint = useMemoizedFn((key: string, isActive: boolean) => {
        if (isActive) {
            if (key === "recycle") return ""
            if (isDetail) {
                return hiddenDetail ? "展开详情列表" : "收起详情列表"
            } else {
                return activeHidden ? "展开高级筛选" : "收起高级筛选"
            }
        } else {
            const item = HubSideBarList.find((item) => item.key === key)
            return `点击进入${item ? item.hint : "列表"}`
        }
    })

    return (
        <div id={rootElementId || undefined} className={styles["plugin-hub-list"]}>
            <div className={styles["side-bar-list"]}>
                {HubSideBarList.map((item, index) => {
                    const isActive = item.key === active
                    const hint = barHint(item.key, isActive)
                    const selected =
                        item.key !== "recycle" && active === item.key && (isDetail ? hiddenDetail : activeHidden)
                    const visible = !!hintShow[item.key]
                    return (
                        <Tooltip
                            overlayClassName='plugins-tooltip'
                            title={isActive ? hint : `点击进入${item.title}列表`}
                            placement='right'
                            visible={visible}
                            onVisibleChange={(visible) =>
                                setHintShow((val) => {
                                    val[item.key] = visible
                                    return {...val}
                                })
                            }
                        >
                            <div
                                className={classNames(styles["side-bar-list-item"], {
                                    [styles["side-bar-list-item-active"]]: isActive,
                                    [styles["side-bar-list-item-selected"]]: selected
                                })}
                                onClick={() => onSetActive(item.key)}
                            >
                                <span className={styles["item-text"]}>{item.title}</span>
                                {item.icon}
                            </div>
                        </Tooltip>
                    )
                })}
            </div>

            <div className={styles["hub-list-body"]}>
                {rendered.current.has("online") && (
                    <div
                        className={classNames(styles["side-content"], {
                            [styles["side-hidden-content"]]: active !== "online"
                        })}
                    >
                        <HubListOnline
                            hiddenFilter={activeHidden}
                            isDetailList={isDetail}
                            hiddenDetailList={hiddenDetail}
                            onPluginDetail={onClickPlugin}
                        />
                    </div>
                )}

                {rendered.current.has("own") && (
                    <div
                        className={classNames(styles["side-content"], {
                            [styles["side-hidden-content"]]: active !== "own"
                        })}
                    >
                        <HubListOwn
                            hiddenFilter={activeHidden}
                            isDetailList={isDetail}
                            hiddenDetailList={hiddenDetail}
                            onPluginDetail={onClickPlugin}
                        />
                    </div>
                )}

                {rendered.current.has("local") && (
                    <div
                        className={classNames(styles["side-content"], {
                            [styles["side-hidden-content"]]: active !== "local"
                        })}
                    >
                        <HubListLocal
                            rootElementId={rootElementId}
                            hiddenFilter={activeHidden}
                            isDetailList={isDetail}
                            hiddenDetailList={hiddenDetail}
                            onPluginDetail={onClickPlugin}
                        />
                    </div>
                )}

                {rendered.current.has("recycle") && (
                    <div
                        className={classNames(styles["side-content"], {
                            [styles["side-hidden-content"]]: active !== "recycle"
                        })}
                    >
                        <HubListRecycle />
                    </div>
                )}
            </div>
        </div>
    )
})
