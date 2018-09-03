import React, { Component } from 'react';
import { Switch, Select, Row, Col, Tree, Collapse } from 'antd';
import './workbench.css';
import Item from 'antd/lib/list/Item';

const Option = Select.Option;
const TreeNode = Tree.TreeNode;
const Panel = Collapse.Panel;

class Workbench extends Component {

    state = {
        tasks: null,
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

    handleChange = (value) => {
        this.setState({
            taskId: value
        })
    }

    handleBlur() {
        console.log('blur');
    }

    handleFocus() {
        console.log('focus');
    }

    onChange(checked) {
        console.log(`switch to ${checked}`);
    }
    onSelect = (selectedKeys, info) => {
        console.log('selected', selectedKeys, info);
    }

    onCheck = (checkedKeys, info) => {
        console.log('onCheck', checkedKeys, info);
    }
    callback(key) {
        console.log(key);
    }
    subTaskTree = (task)=> {
        let subs = "";
        if(task.subTasks) {
            subs = task.subTasks.map( (item, index) => {
                return this.subTaskTree(item);
            })
        }
        return (
            <TreeNode title={task.name} key={task.id}>
                {subs}
            </TreeNode>
        )
        
        
    }
    text = `
        A dog is a type of domesticated animal.
        Known for its loyalty and faithfulness,
        it can be found as a welcome guest in many households across the world.
      `

    render() {
        let options = this.state.tasks ?
            this.state.tasks.map((item, index) => (<Option key={item.id} value={item.id}>{item.name}</Option>)) :
            (<Option value="0" >加载中</Option>);
        let content = "";
        if(this.state.taskId !== null) {
            let task = this.state.tasks.filter( item => item.id === this.state.taskId)[0];
            var nodes = this.subTaskTree(task);
            console.log(nodes);
            let taskTree = (
                    <Tree
                            checkable
                            onSelect={this.onSelect}
                            onCheck={this.onCheck}
                        >
                           { nodes }
                        </Tree>
            )
            content = (
                <Row>
                    <Col className="border-r p-2" span={8}>
                        <header>任务概览</header>
                        <article>
                        {taskTree}
                        </article>
                    </Col>
                    <Col span={16} className="p-2">
                        <header></header>
                        <article>
                            <Collapse onChange={this.callback}>
                                <Panel header={task.name} key="1">
                                111
                                    <Collapse defaultActiveKey="1">
                                        <Panel header="This is panel nest panel" key="1">
                                            <p>{this.text}</p>
                                        </Panel>
                                    </Collapse>
                                </Panel>
                                <Panel header="This is panel header 2" key="2">
                                    <p>{this.text}</p>
                                </Panel>
                                <Panel header="This is panel header 3" key="3">
                                    <p>{this.text}</p>
                                </Panel>
                            </Collapse>
                        </article>
                    </Col>
                </Row>
            )
        }
        return (
            <div>
                <header className="workbench-header">
                    <Switch onChange={this.onChange}
                        checkedChildren="全部任务" unCheckedChildren="待办任务" defaultChecked />
                    <Select
                        showSearch
                        style={{ width: 200 }}
                        placeholder="Select a plan"
                        optionFilterProp="children"
                        onChange={this.handleChange}
                        onFocus={this.handleFocus}
                        onBlur={this.handleBlur}
                        filterOption={(input, option) => option.props.children.toLowerCase().indexOf(input.toLowerCase()) >= 0}
                    >
                        {options}
                    </Select>
                </header>
                {content}

            </div>
        )
    }
}
export default Workbench;