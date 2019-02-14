import React, { Component } from "react";
import PropTypes from "prop-types";
import { Button } from "antd";

class TaskBtns extends Component {
    static propTypes = {
        token: PropTypes.string,
        task: PropTypes.object,
        update: PropTypes.func,
        del: PropTypes.func,
    };
    startTask = () => {
        this.submit(0)
    };
    pauseTask = () => {
        this.submit(2)
    };
    finishTask = () => {
        this.submit(1)
    };
    delTask = () => {
        this.submit(-1)
    };
    submit = (status) => {
        let newFileds = {};
        if(status === -1) {
            newFileds = {
                del: 1
            }
        }else {
            newFileds = {
                status: status
            }
        }
        const newTask =  {
            ...this.props.task,
            ...newFileds,
        }
        fetch('http://localhost:8082/tasks',{
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.props.token}`,               
            },
            body: JSON.stringify({task:newTask})
        }).then(res=>{
            return res.json()
        }).then(data=>{
            if(data.code === 0) {
                if(status === -1) {
                    this.props.del(newTask)
                } else {
                    this.props.update(newTask)
                }
                
            }
            
        })
    }
    render() {
        const status = this.props.task.status;
        // "进行中",
        // "已完成",
        // "暂停",
        // "超时",
        // "未开始"
        const start =
            (status === 2 || status === 4) ? (
                <Button type="primary" className="m-2" onClick={this.startTask}>
                    启动
                </Button>
            ) : (
                ""
            );
        const pause =
            (status === 0 || status === 3) ? (
                <Button type="primary" className="m-2" onClick={this.pauseTask}>
                    暂停
                </Button>
            ) : (
                ""
            );
        const finish =
            (status !== 4 && status!==1) ? (
                <Button type="primary" className="m-2" onClick={this.finishTask}>
                    完成
                </Button>
            ) : (
                ""
            );
        const del = (
            <Button type="primary" className="m-2" onClick={this.delTask}>
                删除
            </Button>
        );
        return (
            <div>
                {start}
                {pause}
                {finish}
                {del}
            </div>
        );
    }
}
export default TaskBtns;
