import React, { Component } from 'react';
import { Switch, Select, Row, Col, Tree, Collapse, Checkbox } from 'antd';
import { Form, Icon, Input, Button, DatePicker } from 'antd';
import Item from 'antd/lib/list/Item';
const { RangePicker } = DatePicker;
const FormItem = Form.Item;
const Option = Select.Option;
const TreeNode = Tree.TreeNode;
const Panel = Collapse.Panel;

class EditTask extends Component {

    constructor(props) {
        super(props);
    }
    state = {
        taskId: null
    }

    componentDidMount() {
        // console.log('edit', this.props)
        let taskId = this.props.match.params.taskId,
            task = this.props.location.state;
        if (!taskId) {
            this.props.history.push('/login');
        }
        if (!task) {
            fetch('https://easy-mock.com/mock/5b8baba761840c7b4033654b/todo/task?id=' + taskId, {
                method: 'GET'
            }).then(res => res.json())
                .then(data => {
                    if (data.code === 1) {
                        task = data.data;
                        // this.setState({
                        //     task: task
                        // })
                    }
                })
        }

    }



    renderTreeNodes = (tasks) => {
        return tasks.map((item) => {
            var title = (<span>{item.name}<Icon className="pr-1" type="edit" /><Icon className="pr-1" type="delete" /><Icon type="plus" /></span>);
            if (item.subTasks) {
                return (
                    <TreeNode title={title} key={item.id} dataRef={item}>
                        {this.renderTreeNodes(item.subTasks)}
                    </TreeNode>
                );
            }
            return <TreeNode title={title} key={item.id} dataRef={item} />;
        });
    }
    render() {
        let taskTree = '';
        let task = this.state.task;

        taskTree = task ? (
            <Tree>
                {this.renderTreeNodes([task])}
            </Tree>
        ) : '';

        return (
            <div>
                <header className="workbench-header">
                    <h3>工作台<small className="h6 ml-3">编辑你的任务</small></h3>
                </header>
                <Row className="d-flex">
                    <Col span={8}>
                        <div className="h5">任务概览</div>
                        <div>
                            {taskTree}
                        </div>
                    </Col>
                    <Col span={16} className="px-2 border-left border-primary">
                        <div className="form">
                            <div className="form-group">
                                <label>任务名</label>
                                <input type="text" className="form-control" />
                            </div>
                            <div className="form-group">
                                <label>描述</label>
                                <input type="text" className="form-control" />
                            </div>
                            <div className="form-group">
                                <label>开始时间</label>
                                <input type="text" className="form-control" />
                            </div>
                            <div className="form-group">
                                <label>结束时间</label>
                                <input type="text" className="form-control" />
                            </div>
                            <button>重置</button>
                            <button>确定</button>
                        </div>
                    </Col>
                </Row>

            </div>
        )
    }
}
export default EditTask;

