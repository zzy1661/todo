import React, { Component } from 'react';
import { Switch, Select, Row, Col, Tree, Collapse, Checkbox, Button } from 'antd';
import './workbench.css';
import Item from 'antd/lib/list/Item';
import CreateTask from '../createTask';
import EditTask from '../editTask';
const Option = Select.Option;
const TreeNode = Tree.TreeNode;
const Panel = Collapse.Panel;

class Workbench extends Component {
    state = {
        tasks: [],
        taskId: null
    }
    componentWillMount() {
        fetch('https://easy-mock.com/mock/5b8baba761840c7b4033654b/todo/task', {
            method: 'GET'
        }).then(res => res.json())
            .then(data => {
                if (data.code === 1) {
                    this.setState({
                        tasks: data.data
                    })
                }
            })
    }
    

    render() {
        var taskItems = this.state.tasks.map(item=>(
            <Col key={item.id} span={6}>
                <div className="text-center p-1 pb-3 bg-primary text-white rounded">
                    <div></div>
                    <div className="h5">{item.name}</div>
                    <h>{item.describe}</h>
                    <div className="d-flex align-items-center small justify-content-center">
                        <span>2007-12-14 </span>
                        <span className="px-2">~</span>
                        <span>2014-12-06 </span>
                    </div>
                    <div className="mt-2">
                        <Button type="default" className="mr-2">编辑</Button>
                        <Button type="danger">删除</Button>
                    </div>
                </div>
            </Col>
        ));
        return (
            <div>
                <header className="workbench-header">
                   <h3>创建/编辑你的任务</h3>
                </header>
                <Row gutter={16}>
                {taskItems}
                </Row>
            </div>
        )
    }
}
export default Workbench;