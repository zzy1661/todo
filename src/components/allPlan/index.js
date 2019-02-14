import React, { Component } from "react";
import PropTypes from "prop-types";
import { Table } from "antd";
import TaskBtns from '../TaskBtns';
class AllPlan extends Component {
    static propTypes = {
        username: PropTypes.string,
        userToken: PropTypes.string,
        removeUser: PropTypes.func,
        tasks: PropTypes.array,
        getTasks: PropTypes.func
    };

    componentDidMount() {
        if (!this.props.username || !this.props.userToken) {
            this.props.removeUser();
            return;
        }
        this.props.getTasks(this.props.userToken);
    }
    render() {
        let columns =  [
            {
                title: "创建时间",
                dataIndex: "creatime",
                key: "creatime"
            },
            {
                title: "任务名称",
                dataIndex: "name",
                key: "name"
            },
            {
                title: "开始时间",
                dataIndex: "startime",
                key: "startime"
            },
            {
                title: "结束时间",
                dataIndex: "endtime",
                key: "endtime"
            },
            {
                title: "任务状态",
                dataIndex: "status",
                key: "status",
                render: status => {
                    var statusList = [
                        "进行中",
                        "已完成",
                        "暂停",
                        "超时",
                        "未开始"
                    ];
                    return <span> {statusList[status]} </span>;
                }
            },
            {
                title: "详情",
                key: "des",
                dataIndex: "des"
            },
            {
                title: "操作",
                key: "action",
                render: (text, record) => (
                    <TaskBtns task={record} token={this.props.userToken} update={this.props.updateTask} del={this.props.delTask}></TaskBtns>
                )
            }
        ];
        return (
            <Table
                rowKey="id"
                columns={columns}
                dataSource={this.props.tasks}
            />
        );
    }
}
export default AllPlan;
