import React, { Component } from 'react';
import { Switch, Select, Row, Col, Tree, Collapse } from 'antd';
import './workbench.css';

const Option = Select.Option;
const TreeNode = Tree.TreeNode;
const Panel = Collapse.Panel;

class Workbench extends Component {

    handleChange(value) {
        console.log(`selected ${value}`);
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

    text = `
        A dog is a type of domesticated animal.
        Known for its loyalty and faithfulness,
        it can be found as a welcome guest in many households across the world.
      `

    render() {
        return (
            <div>
                <header className="workbench-header">
                    <Switch onChange={this.onChange}
                        checkedChildren="全部任务" unCheckedChildren="d待办任务" defaultChecked />
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
                        <Option value="jack">Jack</Option>
                        <Option value="lucy">Lucy</Option>
                        <Option value="tom">Tom</Option>
                    </Select>
                </header>
                <Row>
                    <Col className="border-r p-2" span={8}>
                        <header>任务概览</header>
                        <article>
                            <Tree
                                checkable
                                defaultExpandedKeys={['0-0-0', '0-0-1']}
                                defaultSelectedKeys={['0-0-0', '0-0-1']}
                                defaultCheckedKeys={['0-0-0', '0-0-1']}
                                onSelect={this.onSelect}
                                onCheck={this.onCheck}
                            >
                                <TreeNode title="parent 1" key="0-0">
                                    <TreeNode title="parent 1-0" key="0-0-0" disabled>
                                        <TreeNode title="leaf" key="0-0-0-0" disableCheckbox />
                                        <TreeNode title="leaf" key="0-0-0-1" />
                                    </TreeNode>
                                    <TreeNode title="parent 1-1" key="0-0-1">
                                        <TreeNode title={<span style={{ color: '#1890ff' }}>sss</span>} key="0-0-1-0" />
                                    </TreeNode>
                                </TreeNode>
                            </Tree>
                        </article>
                    </Col>
                    <Col span={16} className="p-2">
                        <header>任务详情</header>
                        <article>
                            <Collapse onChange={this.callback}>
                                <Panel header="This is panel header 1" key="1">
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
            </div>
        )
    }
}
export default Workbench;