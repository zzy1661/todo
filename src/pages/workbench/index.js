import React, { Component } from 'react';
import { Switch, Select, Row, Col, Tree, Collapse, Checkbox } from 'antd';
import './workbench.css';
import Item from 'antd/lib/list/Item';
import CreateTask from '../createTask';
import EditTask from '../editTask';
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
    showAllTasks = (e) => {
        console.log(`checked = ${e.target.checked}`)
    }

    render() {
        let options = this.state.tasks ?
        this.state.tasks.map((item, index) => (<Option key={item.id} value={item.id}>{item.name}</Option>)) :
        (<Option value="0" >加载中</Option>);
        return (
            <div>
                <header className="workbench-header">
                    <Switch onChange={this.onChange} className="mr-2"
                        checkedChildren="编辑任务" unCheckedChildren="创建任务" defaultChecked />
                    <div className="d-inline-block">  
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
                    <Checkbox onChange={this.showAllTasks}>显示全部任务</Checkbox>  
                    </div>
                </header>
                {/* {content} */}
                <EditTask tasks={this.state.tasks}></EditTask>
                {/* <CreateTask></CreateTask> */}
            </div>
        )
    }
}
export default Workbench;