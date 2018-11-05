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

  state = {
    tasks: null,
    taskId: null
}

componentWillMount() {
    this.setState({
        tasks: this.props.tasks
    })
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
                  <header>任务详情</header>
                  <article>
                      <Collapse onChange={this.callback}>
                          <Panel header={task.name} key="1">
                          <article>
                              <div className="h4">描述</div>
                              <section>内容</section>
                          </article>
                          <hr/>
                          <article>
                              <div className="h4">子任务</div>
                              <Collapse defaultActiveKey="1">
                                  <Panel header="This is panel nest panel" key="1">
                                      <p>{this.text}</p>
                                  </Panel>
                              </Collapse>
                          </article>

                          </Panel>
                        
                      </Collapse>
                  </article>
              </Col>
          </Row>
      )
  }
   return content;
    }
}
export default EditTask;

